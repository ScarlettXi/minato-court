# Contributing

Issues and pull requests are welcome. Describe the problem, expected behavior,
and steps to reproduce it. Use synthetic examples rather than personal booking
records, credentials, or browser sessions.

Use Node.js 24+, run `npm ci`, then run `npm run typecheck` and `npm test`.
Keep changes focused. Add regression coverage for changes to account isolation,
monitor ingestion, freshness handling, or notification delivery.

The optional `tests/tenant-api.test.mjs` requires a disposable local preview and
a configured local D1 database. It is intentionally excluded from `npm test`.
Do not run it against a production deployment or a database containing real data.

Keep booking under the user's control. A saved preference does not demonstrate
that a scanner is running; failed or blocked scans must not be reported as
verified availability.

Do not commit `.env.local`, `.dev.vars`, database files, session cookies,
API keys, or deployment credentials. Contribution history and issue comments are
public. Dependency code and third-party data retain their respective terms.
