# Security

This project handles account sessions and per-user monitoring data. When reporting
a vulnerability, use GitHub's private vulnerability reporting option if it is
available. Otherwise, open an issue asking for a private contact channel without
posting exploit details, credentials, or personal records.

## Deployment boundary

The current ChatGPT identity integration assumes a trusted Sites dispatcher
authenticates visitors and replaces the `oai-authenticated-user-*` headers. Never
expose a raw Worker that trusts client-supplied identity headers. A deployment
outside Sites must replace this integration with validated authentication and
reject spoofed headers before it serves users.

`MONITOR_INGEST_KEY` grants privileged access to the monitor ingestion/health
endpoints. Keep it in server-side secrets, never browser code or repository files.
Set `SITE_ORIGIN` to the exact deployed HTTPS origin. Use your own Supabase and
email-provider configuration where those features are enabled.

## Verification limits

Automated tests cover selected authorization, isolation, ingestion, notification,
and rendering behavior. They are not a complete security audit. External login,
email/SMS delivery, official-site changes, and unattended scanner operation need
separate integration verification. Review dependency advisories before production
deployment; see `RELIABILITY.md` for the inherited dependency status.
