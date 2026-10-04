# Minato Court monitoring reliability

The included runner and schedule are documented in [scanner setup](docs/monitor-setup.md).
Cloning or deploying the web app does not enable the schedule. Configure your own
runner and credentials, then test a dry run and a write/readback cycle.

## Implemented safeguards

- Official requests are read-only, serial, separated by at least three seconds, with
  20-second request timeouts and a seven-minute process deadline. No booking or payment.
- A court is ingested only after every facility and every date in the configured
  window has been parsed. Unknown states or partial calendars fail closed.
- Protocol 2 date-scoped ingestion changes only first-come observations in the checked
  dates. Other dates, lottery records and other tenants remain untouched.
- The runner checks settings before writing, verifies readback, and then reports success.
  The existing ingestion API may enqueue/send subscribed emails during ingestion;
  readback verification is not proof of delivery. Telegram is not implemented here.
- Dry runs never write observations or remote health. HTTP mutations are never retried
  automatically. Official access/rate-limit blocks are stored locally and, on write
  runs, in tenant health; they require explicit human clearing.
- The local flock lock protects one state path; Actions concurrency protects one repo.
  Neither is a distributed lock across machines/repositories. Operate one writer per site.
- Failed scans retain previous success timestamps. Every displayed slot checks its own
  observation age and scan coverage; ten-minute-old observations become stale.
- The scheduler is best effort. Delayed/dropped jobs, offline machines and expired or
  missing credentials can stop updates. No independent offline alerting is included.

## Validation and limitations

`npm test` runs offline API, scanner, build and rendered-output checks. Tests cover
incomplete calendars, lost readback, date/type/account isolation, pause, blocking,
redirect refusal and stale observations. Live public reads verified the default three
Tokyo venues on 2026-10-05. Other catalog entries and long-running delivery require
separate checks. There is no 24/7 availability or zero-error guarantee.

## Dependency follow-up

The React/RSC packages are pinned together to 19.2.8 to address GHSA-wx67-qw84-cm4g.
Other pre-existing npm audit findings remain under review; this release is not a
claim that the dependency tree is free of vulnerabilities. Avoid blanket
`npm audit fix --force` and test framework/toolchain upgrades separately.
