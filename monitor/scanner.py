#!/usr/bin/env python3
"""Read-only public-calendar scanner. Python 3.9+, standard library only."""
import argparse
import datetime as dt
import fcntl
import http.cookiejar
import json
import os
from pathlib import Path
import re
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

BASES = {'tokyo': 'https://kouen.sports.metro.tokyo.lg.jp/web/',
         'minato': 'https://web101.rsv.ws-scs.jp/web/'}
SEARCH = 'rsvWOpeInstSrchVacantAction.do'
WEEK = 'rsvWOpeInstSrchVacantAjaxAction.do'
JST = dt.timezone(dt.timedelta(hours=9))


class ScanError(Exception):
    pass


class Blocked(ScanError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # In particular, never forward x-monitor-key to an identity gateway.
        raise ScanError('redirect_refused')


class Transport:
    def __init__(self, delay=3):
        self.opener = urllib.request.build_opener(
            NoRedirect(), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.delay = delay
        self.last = 0.0

    def request(self, url, data=None, headers=None):
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        request = urllib.request.Request(url, data=data, headers={
            'User-Agent': 'MinatoCourt/0.1 (public availability monitor)', **(headers or {})})
        try:
            with self.opener.open(request, timeout=20) as response:
                raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise ScanError('response_too_large')
                charset = response.headers.get_content_charset() or 'utf-8'
                if charset.lower() in ('windows-31j', 'shift_jis'):
                    charset = 'cp932'
                return raw.decode(charset)
        except urllib.error.HTTPError as error:
            if error.code in (401, 403, 429):
                raise Blocked('access_or_rate_limit') from None
            raise ScanError('http_' + str(error.code)) from None
        except (urllib.error.URLError, TimeoutError, UnicodeError):
            raise ScanError('network_or_encoding') from None


class Form(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.fields = {}
        self.facilities = []
        self.select = None
        self.option = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'input' and attrs.get('name') and attrs.get('type') in ('hidden', 'date'):
            self.fields[attrs['name']] = attrs.get('value', '')
        if tag == 'select':
            self.select = attrs.get('id')
        if tag == 'option' and self.select == 'facility-select':
            self.option = [attrs.get('value'), '']

    def handle_data(self, data):
        if self.option is not None:
            self.option[1] += data

    def handle_endtag(self, tag):
        if tag == 'option' and self.option is not None:
            if self.option[0] != '0':
                self.facilities.append(tuple(self.option))
            self.option = None
        if tag == 'select':
            self.select = None


def date_number(value):
    text = str(value)
    if not re.fullmatch(r'\d{8}', text):
        raise ScanError('invalid_calendar_date')
    try:
        return dt.datetime.strptime(text, '%Y%m%d').date()
    except ValueError:
        raise ScanError('invalid_calendar_date') from None


def clock(value):
    if type(value) is not int or value < 0 or value > 2359 or value % 100 > 59:
        raise ScanError('invalid_calendar_time')
    return f'{value // 100:02d}:{value % 100:02d}'


def parse_week(payload, start, court_key, source):
    """Require the full 7-day matrix; only status=0 means an available slot."""
    if not isinstance(payload, dict) or 'ErrManager' in payload:
        raise ScanError('official_error')
    expected = [start + dt.timedelta(days=i) for i in range(7)]
    try:
        dates = [date_number(day['useDay']) for day in payload['weekDay']]
        rows = payload['result']
        if payload['dayNum'] != 7 or dates != expected or not isinstance(rows, list) or not rows:
            raise ScanError('incomplete_calendar')
        if payload['lendType'] not in (1, 2, 3, 4) or payload['imstRsvMediaFlg'] != 3:
            raise ScanError('unsupported_calendar')
        slots = []
        seen = set()
        for row in rows:
            cells = row['timeResult']
            if not isinstance(cells, list) or [date_number(c['useDay']) for c in cells] != expected:
                raise ScanError('incomplete_calendar')
            for cell in cells:
                day = date_number(cell['useDay']).isoformat()
                begin, end = clock(cell['startTime']), clock(cell['endTime'])
                if begin >= end or (day, begin, end) in seen:
                    raise ScanError('invalid_calendar_interval')
                seen.add((day, begin, end))
                status = cell['status']
                # Nonzero statuses are accepted only when their visible meaning is known.
                if type(status) is not int or not isinstance(cell.get('alt'), str):
                    raise ScanError('unknown_calendar_status')
                if status != 0 and cell['alt'] not in (
                        '予約あり', '保守日', '休館日', '受付期間外', '受付時間外',
                        '利用時間外', '営業時間外', '申込期間外', '予約不可', '開放なし'):
                    raise ScanError('unknown_calendar_status')
                if status == 0:
                    if (cell['selectNum'] != 0 or type(cell['rsvNum']) is not int
                            or cell['rsvNum'] <= 0):
                        raise ScanError('inconsistent_available_count')
                    slots.append(dict(courtKey=court_key, slotDate=day,
                                      startTime=begin, endTime=end,
                                      sourceUrl=source, reservationType='first_come'))
        return slots
    except (KeyError, TypeError, ValueError):
        raise ScanError('invalid_calendar_schema') from None


class OfficialScanner:
    def __init__(self, state, save_state, transport=None):
        self.state, self.save_state = state, save_state
        self.transport = transport or Transport()
        self.homes = {}

    def fetch(self, system, path='', fields=None):
        if system in self.state.get('blockedSystems', []):
            raise Blocked('persisted_official_block')
        if path not in ('', SEARCH, WEEK):
            raise ScanError('non_readonly_action_refused')
        data = None if fields is None else urllib.parse.urlencode(fields, encoding='cp932').encode()
        try:
            text = self.transport.request(BASES[system] + path, data, {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': BASES[system],
            })
            if re.search(r'g-recaptcha|h-captcha|cf-chl-|画像認証を入力', text, re.I):
                raise Blocked('official_challenge')
            return text
        except Blocked:
            self.state['blockedSystems'] = sorted(set(self.state.get('blockedSystems', []) + [system]))
            self.save_state(self.state)
            raise

    def scan(self, court, start, days):
        system = court['system']
        if system not in BASES:
            raise ScanError('unsupported_system')
        if system not in self.homes:
            self.homes[system] = Form(self.fetch(system)).fields
        if self.homes[system].get('displayNo') != 'pawab2000':
            raise ScanError('unexpected_home_page')
        if system == 'minato':
            if court['key'] != 'azabu':
                raise ScanError('unsupported_minato_court')
            park, area, sport = '70100', '1000_70100', '2000_2000040'
        else:
            park, sport = court['officialParkId'], court['sportValue']
            if not re.fullmatch(r'\d{4}', str(park)) or sport not in ('1000_1020', '1000_1030'):
                raise ScanError('unsupported_tokyo_court')
            area = park
        fields = {**self.homes[system], 'daystart': start.isoformat(),
                  'daystarthome': start.isoformat(), 'selDay': '7',
                  'selectPpsClPpscd': sport, 'selectPpsClsCd': sport.split('_')[0],
                  'selectPpsCd': sport.split('_')[1], 'selectBldCd': park,
                  'selectAreaBcd': area, 'selectIcd': '0',
                  'dayofweekClearFlg': '1', 'timezoneClearFlg': '1'}
        form = Form(self.fetch(system, SEARCH, fields))
        if (form.fields.get('displayNo') != 'prwrc2000'
                or form.fields.get('selectBldCd') != park
                or form.fields.get('selectPpsClPpscd') != sport
                or not form.facilities or len(form.facilities) > 8):
            raise ScanError('unexpected_search_result')
        if any(not re.fullmatch(r'\d+', code or '') or ('テニス' not in label and label not in ('ハード', '人工芝'))
               for code, label in form.facilities):
            raise ScanError('unexpected_facility')
        if len({code for code, _ in form.facilities}) != len(form.facilities):
            raise ScanError('duplicate_facility')
        slots = {}
        # All facilities and all weeks must succeed before any write is permitted.
        for facility, _ in form.facilities:
            for offset in range(0, days, 7):
                date = start + dt.timedelta(days=offset)
                text = self.fetch(system, WEEK, dict(displayNo='prwrc2000',
                    useDay=date.strftime('%Y%m%d'), bldCd=park, instCd=facility,
                    transVacantMode='0', clearFlag='0'))
                try:
                    payload = json.loads(text)
                except ValueError:
                    raise ScanError('non_json_calendar') from None
                for slot in parse_week(payload, date, court['key'], BASES[system]):
                    slots[(slot['slotDate'], slot['startTime'], slot['endTime'])] = slot
        return list(slots.values())


class Site:
    def __init__(self, origin, key, transport=None):
        parts = urllib.parse.urlsplit(origin)
        if (parts.scheme != 'https' or not parts.netloc or parts.username or parts.password
                or parts.query or parts.fragment or parts.path not in ('', '/')):
            raise ScanError('MONITOR_SITE_ORIGIN_must_be_an_https_origin')
        if not key:
            raise ScanError('MONITOR_INGEST_KEY_required')
        self.origin, self.key = origin.rstrip('/'), key
        # Separate transport/cookie jar: the monitor key NEVER goes to official sites.
        self.transport = transport or Transport(delay=0)

    def call(self, path, body=None):
        raw = self.transport.request(self.origin + '/api/' + path,
            None if body is None else json.dumps(body).encode(),
            {'x-monitor-key': self.key, 'Content-Type': 'application/json'})
        try:
            result = json.loads(raw)
        except ValueError:
            raise ScanError('site_response_not_json') from None
        if not isinstance(result, dict) or 'error' in result:
            raise ScanError('site_rejected_request')
        return result

    def snapshot(self, user):
        snapshot = self.call('monitor-ingest?' + urllib.parse.urlencode({'userId': user}))
        if snapshot.get('protocolVersion') != 2 or snapshot.get('userId') != user:
            raise ScanError('upgrade_site_to_monitor_protocol_2')
        if not isinstance(snapshot.get('selectedCourts'), list):
            raise ScanError('invalid_monitor_settings')
        return snapshot


def utcnow():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def matches(slot, court):
    return slot['startTime'] < court['targetEnd'] and slot['endTime'] > court['targetStart']


def identities(slots, camel=True):
    fields = ('courtKey', 'slotDate', 'startTime', 'endTime') if camel else (
        'court_key', 'slot_date', 'start_time', 'end_time')
    return {tuple(s[f] for f in fields) for s in slots}


def run_account(site, scanner, snapshot, start, days, write, cache):
    user = snapshot['userId']
    old = snapshot.get('health') or {}
    health = {'perCourt': {}, 'lastEndToEndSuccessAt': old.get('lastEndToEndSuccessAt'),
              'officialBlocks': [], 'status': 'unknown', 'telegramStatus': 'disabled'}
    window = dict(startDate=start.isoformat(), endDate=(start + dt.timedelta(days=days - 1)).isoformat())
    success, failures = 0, 0
    if snapshot['settings'].get('active') != 1:
        print(json.dumps({'status': 'paused'}))
        return 0
    for court in snapshot['selectedCourts']:
        key = court['key']
        previous = (old.get('perCourt') or {}).get(key) or {}
        entry = {**previous, 'lastSuccessAt': previous.get('lastSuccessAt'),
                 'consecutiveFailures': min(previous.get('consecutiveFailures', 0) + 1, 1_000_000),
                 'status': 'error'}
        health['perCourt'][key] = entry
        try:
            if key not in cache:
                try:
                    cache[key] = scanner.scan(court, start, days)
                except ScanError as error:
                    cache[key] = error
            if isinstance(cache[key], Exception):
                raise cache[key]
            slots = [s for s in cache[key] if matches(s, court)]
            if write:
                # Recheck before mutation: don't overwrite results after a settings change.
                current = site.snapshot(user)
                if current['settings'].get('active') != 1 or current['selectedCourts'] != snapshot['selectedCourts']:
                    raise ScanError('settings_changed_during_scan')
                result = site.call('monitor-ingest', dict(userId=user, checkedCourts=[key],
                    slots=slots, scanWindow=window,
                    runMessage=f"Public first-come calendar {window['startDate']} .. {window['endDate']}"))
                if result.get('ok') is not True or result.get('checkedCourts') != 1:
                    raise ScanError('ingest_not_acknowledged')
                actual = site.snapshot(user)
                if actual['selectedCourts'] != snapshot['selectedCourts'] or actual['settings'].get('active') != 1:
                    raise ScanError('settings_changed_during_readback')
                saved = [s for s in actual['currentSlots'] if s['court_key'] == key
                         and window['startDate'] <= s['slot_date'] <= window['endDate']
                         and s['reservation_type'] == 'first_come']
                # The API also drops already-ended slots on today's date.
                now = dt.datetime.now(JST)
                expected = [s for s in slots if s['slotDate'] > now.date().isoformat()
                            or s['endTime'] > now.strftime('%H:%M')]
                if identities(saved, False) != identities(expected):
                    raise ScanError('readback_mismatch')
                entry.update(lastSuccessAt=utcnow(), consecutiveFailures=0,
                             status='healthy', scanWindow=window)
            success += 1
            print(json.dumps({'court': key, 'status': 'written_and_verified' if write else 'dry_run',
                              'slots': len(slots), 'scanWindow': window}))
        except ScanError as error:
            failures += 1
            entry['status'] = 'blocked' if isinstance(error, Blocked) else 'error'
            if isinstance(error, Blocked):
                health['officialBlocks'].append(court['system'])
            # Controlled error codes only; never echo HTTP bodies, emails, cookies or keys.
            print(json.dumps({'court': key, 'status': entry['status'], 'reason': str(error)}))
    health['officialBlocks'] = sorted(set(health['officialBlocks']))
    health['status'] = 'healthy' if not failures else 'partial' if success else 'error'
    if not failures:
        health['lastEndToEndSuccessAt'] = utcnow()
    if write:
        result = site.call('monitor-health', dict(userId=user, health=health))
        if result.get('ok') is not True:
            raise ScanError('health_not_acknowledged')
    return failures


def load_state(path):
    if not path.exists():
        return {'blockedSystems': []}
    try:
        state = json.loads(path.read_text())
        if not isinstance(state, dict) or not isinstance(state['blockedSystems'], list):
            raise ValueError()
        if any(x not in BASES for x in state['blockedSystems']):
            raise ValueError()
        return state
    except (ValueError, KeyError):
        raise ScanError('invalid_state_file') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='write verified results; may send configured emails')
    parser.add_argument('--days', type=int, choices=(7, 14, 21, 28), default=7)
    parser.add_argument('--state', type=Path, default=Path('.monitor-state.json'))
    parser.add_argument('--clear-block', choices=tuple(BASES))
    args = parser.parse_args()
    args.state.parent.mkdir(parents=True, exist_ok=True)
    # Locks survive no crashes; the OS releases flock when the process exits.
    with open(str(args.state) + '.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ScanError('another_scan_is_running') from None
        state = load_state(args.state)
        def save(value):
            temporary = args.state.with_suffix('.tmp')
            temporary.write_text(json.dumps(value))
            os.chmod(temporary, 0o600)
            temporary.replace(args.state)
        def deadline(*_):
            raise ScanError('scan_deadline_exceeded')
        signal.signal(signal.SIGALRM, deadline)
        signal.alarm(420)
        site = Site(os.environ.get('MONITOR_SITE_ORIGIN', ''), os.environ.get('MONITOR_INGEST_KEY', ''))
        user = os.environ.get('MONITOR_USER_ID', 'owner')
        if user == 'all':
            page = site.call('monitor-ingest?listUsers=1')
            if page.get('next') or not isinstance(page.get('users'), list) or len(page['users']) > 50:
                raise ScanError('too_many_accounts_use_separate_runners')
            users = page['users']
        else:
            users = [user]
        snapshots = [site.snapshot(u) for u in users]
        if args.clear_block:
            for snapshot in snapshots:
                health = snapshot.get('health')
                if not health:
                    continue
                health['officialBlocks'] = [s for s in health.get('officialBlocks', []) if s != args.clear_block]
                health['status'] = 'unknown'
                for court in snapshot['selectedCourts']:
                    entry = health.get('perCourt', {}).get(court['key'])
                    if entry and court['system'] == args.clear_block:
                        entry['status'] = 'unknown'
                if site.call('monitor-health', dict(userId=snapshot['userId'], health=health)).get('ok') is not True:
                    raise ScanError('block_reset_not_acknowledged')
            state['blockedSystems'] = [s for s in state['blockedSystems'] if s != args.clear_block]
            save(state)
            print('Official service block cleared; no scan performed.')
            return 0
        for snapshot in snapshots:
            for system in (snapshot.get('health') or {}).get('officialBlocks', []):
                if system in BASES:
                    state['blockedSystems'] = sorted(set(state['blockedSystems'] + [system]))
        save(state)
        unique = {c['key'] for s in snapshots if s['settings'].get('active') == 1 for c in s['selectedCourts']}
        if len(unique) > 8:
            raise ScanError('max_8_unique_courts_per_run')
        scanner = OfficialScanner(state, save)
        failures, cache = 0, {}
        start = dt.datetime.now(JST).date()
        for snapshot in snapshots:
            failures += run_account(site, scanner, snapshot, start, args.days, args.write, cache)
        return 1 if failures else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except ScanError as error:
        print(json.dumps({'status': 'failed', 'reason': str(error)}), file=sys.stderr)
        sys.exit(1)
