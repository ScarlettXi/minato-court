import copy
import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest

from scanner import (Blocked, Form, NoRedirect, OfficialScanner, ScanError, Site,
                     load_state, parse_week, run_account)

START = dt.date(2030, 1, 1)
COURT = dict(key='shiba', system='tokyo', officialParkId='1010', sportValue='1000_1030',
             targetStart='17:00', targetEnd='21:00')
WINDOW = dict(startDate='2030-01-01', endDate='2030-01-07')


def calendar():
    days = [int((START + dt.timedelta(days=i)).strftime('%Y%m%d')) for i in range(7)]
    return dict(dayNum=7, lendType=3, imstRsvMediaFlg=3,
                weekDay=[{'useDay': d} for d in days],
                result=[dict(timeResult=[dict(useDay=d, startTime=1700, endTime=1900,
                    status=0 if i == 0 else 210, alt='空き' if i == 0 else '予約あり',
                    rsvNum=2 if i == 0 else 0, selectNum=0) for i, d in enumerate(days)])])


def snapshot():
    return dict(protocolVersion=2, userId='tenant-a', settings={'active': 1},
                selectedCourts=[COURT], currentSlots=[], health={
                    'perCourt': {'shiba': {'lastSuccessAt': '2029-12-31T00:00:00Z',
                                         'consecutiveFailures': 2, 'status': 'error'}}})


class StubSite:
    def __init__(self):
        self.state = snapshot()
        self.writes = []
        self.readback_bad = False

    def snapshot(self, user):
        assert user == 'tenant-a'
        return copy.deepcopy(self.state)

    def call(self, path, body):
        assert body['userId'] == 'tenant-a'
        self.writes.append((path, copy.deepcopy(body)))
        if path == 'monitor-ingest':
            if not self.readback_bad:
                self.state['currentSlots'] = [dict(court_key=s['courtKey'], slot_date=s['slotDate'],
                    start_time=s['startTime'], end_time=s['endTime'], reservation_type='first_come')
                    for s in body['slots']]
            return dict(ok=True, checkedCourts=1, acceptedSlots=len(body['slots']))
        return dict(ok=True)


class StubScanner:
    def __init__(self, failure=None):
        self.calls = 0
        self.failure = failure

    def scan(self, *args):
        self.calls += 1
        if self.failure:
            raise self.failure
        return parse_week(calendar(), START, 'shiba', 'https://example.test/')


class ScannerTests(unittest.TestCase):
    def test_only_confirmed_openings_and_explicit_full_calendar(self):
        slots = parse_week(calendar(), START, 'shiba', 'https://example.test/')
        self.assertEqual(len(slots), 1)
        self.assertEqual(slots[0]['startTime'], '17:00')
        payload = calendar()
        payload['result'][0]['timeResult'][0].update(status=210, alt='予約あり', rsvNum=0)
        self.assertEqual(parse_week(payload, START, 'shiba', 'https://example.test/'), [])

    def test_missing_empty_shifted_duplicate_or_unknown_calendar_fails(self):
        mutations = [lambda p: p.update(result=[]),
                     lambda p: p['weekDay'].pop(),
                     lambda p: p['result'][0]['timeResult'].pop(),
                     lambda p: p['result'].append(copy.deepcopy(p['result'][0])),
                     lambda p: p['result'][0]['timeResult'][0].update(status=999, alt='unknown'),
                     lambda p: p['result'][0]['timeResult'][0].update(rsvNum=0),
                     lambda p: p['result'][0]['timeResult'][0].update(startTime=2460),
                     lambda p: p.update(ErrManager={'message': 'denied'})]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                payload = calendar()
                mutate(payload)
                with self.assertRaises(ScanError):
                    parse_week(payload, START, 'shiba', 'https://example.test/')
        with self.assertRaises(ScanError):
            parse_week(calendar(), START + dt.timedelta(days=1), 'shiba', 'https://example.test/')

    def test_form_reads_every_facility(self):
        form = Form('<select id="facility-select"><option value="0">Choose</option>'
                    '<option value="1">テニスＡ</option><option value="2">テニスＢ</option></select>')
        self.assertEqual(form.facilities, [('1', 'テニスＡ'), ('2', 'テニスＢ')])

    def test_dry_run_never_writes(self):
        site = StubSite()
        self.assertEqual(run_account(site, StubScanner(), snapshot(), START, 7, False, {}), 0)
        self.assertEqual(site.writes, [])

    def test_failed_scan_keeps_slots_and_last_success(self):
        site = StubSite()
        self.assertEqual(run_account(site, StubScanner(ScanError('timeout')), snapshot(), START, 7, True, {}), 1)
        self.assertEqual([p for p, _ in site.writes], ['monitor-health'])
        entry = site.writes[-1][1]['health']['perCourt']['shiba']
        self.assertEqual(entry['lastSuccessAt'], '2029-12-31T00:00:00Z')
        self.assertEqual(entry['consecutiveFailures'], 3)
        self.assertEqual(entry['status'], 'error')

    def test_write_is_scoped_to_dates_and_account_then_verified(self):
        site = StubSite()
        self.assertEqual(run_account(site, StubScanner(), snapshot(), START, 7, True, {}), 0)
        self.assertEqual(site.writes[0][1]['scanWindow'], WINDOW)
        self.assertNotIn('bookingUpdates', site.writes[0][1])
        self.assertEqual(site.writes[-1][1]['health']['perCourt']['shiba']['scanWindow'], WINDOW)
        self.assertEqual(site.writes[-1][1]['health']['status'], 'healthy')

    def test_readback_mismatch_never_reports_success(self):
        site = StubSite()
        site.readback_bad = True
        self.assertEqual(run_account(site, StubScanner(), snapshot(), START, 7, True, {}), 1)
        self.assertEqual(site.writes[-1][1]['health']['status'], 'error')

    def test_pause_and_settings_changes_prevent_slot_writes(self):
        site = StubSite()
        paused = snapshot()
        paused['settings']['active'] = 0
        scanner = StubScanner()
        run_account(site, scanner, paused, START, 7, True, {})
        self.assertEqual(scanner.calls, 0)
        self.assertEqual(site.writes, [])
        site.state['selectedCourts'] = []
        self.assertEqual(run_account(site, scanner, snapshot(), START, 7, True, {}), 1)
        self.assertEqual([p for p, _ in site.writes], ['monitor-health'])

    def test_shared_public_scan_is_cached_without_sharing_tenant_writes(self):
        cache, scanner = {}, StubScanner()
        run_account(StubSite(), scanner, snapshot(), START, 7, True, cache)
        run_account(StubSite(), scanner, snapshot(), START, 7, True, cache)
        self.assertEqual(scanner.calls, 1)

    def test_block_is_persisted_and_blocks_further_http(self):
        class Denied:
            def __init__(self): self.calls = 0
            def request(self, *args):
                self.calls += 1
                raise Blocked('access_or_rate_limit')
        transport, saved = Denied(), []
        scanner = OfficialScanner({'blockedSystems': []}, lambda s: saved.append(copy.deepcopy(s)), transport)
        for _ in range(2):
            with self.assertRaises(Blocked): scanner.fetch('tokyo')
        self.assertEqual(transport.calls, 1)
        self.assertEqual(saved, [{'blockedSystems': ['tokyo']}])
        with self.assertRaises(ScanError): scanner.fetch('minato', 'booking-action')

    def test_origin_and_redirect_guard(self):
        for url in ['http://example.test', 'https://u:p@example.test', 'https://example.test/path',
                    'https://example.test/?key=secret']:
            with self.assertRaises(ScanError): Site(url, 'test-only')
        with self.assertRaises(ScanError):
            NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.test')

    def test_malformed_state_is_not_silently_reset(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'state.json'
            self.assertEqual(load_state(path), {'blockedSystems': []})
            path.write_text('{broken')
            with self.assertRaises(ScanError): load_state(path)


if __name__ == '__main__':
    unittest.main()
