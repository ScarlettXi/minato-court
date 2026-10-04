# Accounts and email notifications

This repository contains the web app and its monitor API. Configure your own deployment,
identity providers, and external scanning task. Repository visibility does not change
the access policy of a running website or start an automation.

## Identity and data ownership

- Existing ChatGPT sign-in is supported by the Sites dispatcher. Its trusted user ID is the account key; browser-supplied account IDs are never used to select dashboard data.
- `OWNER_BOOTSTRAP_EMAIL` must be set to the existing site's verified owner email through Sites environment variables before deployment. The first matching verified ChatGPT identity binds the existing `owner` data permanently to its stable provider ID. Supabase email/phone accounts cannot claim the existing owner data even when their email matches.
- New users receive empty, inactive monitoring settings. Settings, slots, scan results, booking records and email notifications are scoped by server-resolved user ID.
- New users book directly at the official site. They cannot use the owner's booking assistant or official reservation credentials.

## Configure email and phone login

1. Create or sign in to an account at https://supabase.com/dashboard and create a dedicated project.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Sites runtime variables (the publishable/anon key is sufficient; do not use a service-role key).
3. Enable email authentication. Configure custom SMTP before allowing general users; the provider's built-in mail service is restricted.
4. Set the Magic Link and Change Email templates to show `{{ .Token }}` so users receive a code, rather than a link. The app uses `/otp`, `/verify`, `/user`, and refresh-token endpoints over HTTPS. Do not configure the app's sign-in as an implicit URL-fragment flow.
5. For phone sign-in, configure the SMS provider in Supabase and only then set `PHONE_LOGIN_ENABLED=true`. Phone-only users can verify a notification email from Account & notifications. Existing verified email changes are intentionally not offered by the UI.
6. Set `SITE_ORIGIN` to the exact deployed HTTPS origin. Keep provider rate limits enabled. Application send/verify throttles are also enforced server-side.

Provider access and refresh tokens are held in HttpOnly, SameSite cookies. The backend verifies the provider session before resolving a user. A missing or expired session never defaults to the owner.

Sources: https://supabase.com/docs/guides/auth/auth-email-passwordless , https://supabase.com/docs/reference/javascript/auth-verifyotp , https://supabase.com/docs/guides/auth/auth-smtp .

## Configure actual reminder emails

1. Create or sign in at https://resend.com/signup .
2. Verify an owned sending domain through its DNS records. The Resend onboarding sender is for limited testing, not general-user delivery.
3. Set `RESEND_API_KEY` as a secret and `RESEND_FROM_EMAIL` to a verified sender in Sites. Preserve `MONITOR_INGEST_KEY` and all existing variables.
4. Deploy to apply runtime settings. Use Account & notifications → Send test email. A successful API response means the provider accepted it; confirm inbox delivery separately.

New availability is summarized into one email per scan/account, with at most 100 details and a link to the full dashboard. Outbox creation is atomic with saved scan results. Retries reuse the same idempotency key and stop before its 24-hour provider lifetime; changed addresses and opted-out users are not sent queued availability alerts. Owner notifications default to the existing push channel.

Sources: https://resend.com/docs/api-reference/emails/send-email , https://resend.com/changelog/idempotency-keys .

## Monitor API compatibility

- The existing keyed `/api/monitor-ingest` GET/POST still defaults to `owner`, preserving the private workflow.
- A trusted monitor lists active user IDs via `GET /api/monitor-ingest?listUsers=1`; follow its `next` cursor as `after` until null.
- Fetch each account with `GET /api/monitor-ingest?userId=...`; include the same `userId` in the POST body. Respect each account's selected courts and court hours.
- Monitoring is continuous. API settings expose `monitoring_mode: "continuous"`, a start date computed from today's Tokyo date, and `end_date: null`. Old stored date columns no longer restrict results. Check all dates actually exposed by the official booking calendar, then revisit newly released dates on subsequent runs. Never iterate an infinite calendar or infer availability for unreleased dates.
- Saving court selections enables continuous monitoring for that account. The dashboard refreshes saved scan results every minute while visible; this refresh does not itself scan the official website.
- Only completed court scans may go in `checkedCourts`. Empty or failed scans must never expire unverified results.
- Only the owner's `push` channel is announced in the owner's Codex task. Other accounts receive backend emails; their information must not appear in the owner's chat.
- A website monitoring preference does not itself wake a paused Codex automation. Pause/resume the existing task when the user requests it; retain its history and five-minute schedule.

## Validation

`node --test tests/court-catalog.test.mjs tests/auth-mail.test.mjs` covers catalog rules, identity mapping, authenticated cookies, message scoping, idempotency, and retry handling with a mocked external provider.

`RUN_LOCAL_TENANT_TESTS=1 node tests/tenant-api.test.mjs` targets only `http://localhost:3000`, expects the local test environment, exercises actual APIs with two users, and restores local database contents. It is not a production test and sends no real messages.

Real login, SMS delivery and inbox receipt must be verified after the service accounts and sending domain are configured. Do not report mocked tests as live delivery.
