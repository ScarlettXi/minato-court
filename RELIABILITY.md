# Minato Court recovery policy

This document records the source deployment's operational design. The external
scanner, Telegram integration and cloud watchdog described below are not included
in this repository. Configure and verify equivalent components separately.
No running service or schedule is created by cloning this repository.

This is bounded recovery, not a promise of continuous availability or zero errors.
Do not loosen authentication, change saved court/time/date choices, submit unconfirmed
reservations, pay, solve CAPTCHA, discard records, or deploy arbitrary untested fixes.

## Evidence and recovery

- The local scanner remains the only availability writer. It verifies official data,
  writes through `/api/monitor-ingest`, reads it back, and then considers notification.
- A parent-owned lock and eight-minute child deadline bound a scan. Only its own child
  may be terminated. The existing three-minute heartbeat tries again on the next run.
- Network retries are finite. Official authentication rejection/CAPTCHA is persisted
  per service until explicitly cleared by a human. It must not be auto-cleared.
- Telegram has no exactly-once transaction with local storage. Persist `sending`
  before requesting delivery; only API acknowledgement confirms acceptance. Interrupted
  or ambiguous delivery is `unknown`, not eligible for blind replay or a success claim.
- `/api/monitor-health` accepts the existing monitor key and only bounded, tenant-scoped
  health fields. It cannot change settings, bookings, slots or authorization. Its server
  timestamp is a receipt, not proof of a successful scan. Never put secrets in health.
- The dashboard keeps previous data on read failure, automatically retries GET only
  (at most three attempts, 15-second request timeout), and marks court data older than
  ten minutes as stale. Mutations are not automatically replayed.

## Independent cloud watchdog

Use Sites native `get_site`, `read_database_overview`, and
`read_database_table_rows`, preserving exact returned binding/table names. Read only
`watch_settings`, `monitor_health`, and (for legacy evidence) `monitor_runs`. Do not
read credential tables or call official booking services. Consider only account
`owner`, `active=1`, and currently selected court keys. Paused/unselected courts are
not failures. A saved activation toggle is not a running-process signal.

Report a new incident if health receipts or selected-court successes are over ten
minutes old, or if an official service is blocked or delivery is unconfirmed. Name
the failing layer and the evidence timestamp; do not call old openings available.
Suppress repeated notifications for the same unresolved incident and reset after
verified recovery. For a transient cloud read failure, retry once, then report
unavailable evidence rather than fabricate health. This cloud check can detect an
offline Mac but cannot start it or repair macOS remotely. It is not a second scanner.
No autonomous source changes, database repair, permission changes or redeployment
are permitted by this watchdog policy.

## Validation

Run scanner offline regression/fault tests and Site health/auth/tenant tests before
publication. D1 migration 0006 only creates `monitor_health`; existing rows are untouched.
Site `npm run build` plus rendered HTML tests validate the Worker artifact. A real
scan plus native D1 readback verifies the unattended health writer. Check actual
run records over the next 24–48 hours before making a reliability claim.

## Dependency follow-up

The React/RSC packages are pinned together to 19.2.8 to address GHSA-wx67-qw84-cm4g.
Other pre-existing npm audit findings remain under review; this release is not a
claim that the dependency tree is free of vulnerabilities. Avoid blanket
`npm audit fix --force` and test framework/toolchain upgrades separately.
