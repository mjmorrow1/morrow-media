# Secret names

Names only. Do not put values, hashes, tokens, or connection strings in this repository, in screenshots, or in the admin setup guide.

When this file was added on November 8, 2026, GitHub reported `mjmorrow1/morrow-media` as **public**. A public repository is not a secret store. An owner should switch it to private before treating it as the operational source of truth.

## Worker `morrow-media`

Set these as Cloudflare Worker secrets (secret text). Deployments must keep existing secret bindings.

Required for admin login:

- `ADMIN_EMAIL`
- `ADMIN_PASS_HASH`
- `SESSION_SECRET`

Required for Site AI:

- `XAI_API_KEY`

Optional Google Calendar. Absence means the admin calendar is not connected:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CALENDAR_TOKEN_KEY` (encrypts the read-only refresh token at rest)
- `GOOGLE_REFRESH_TOKEN` (older follow-up write sync only; not used as proof of the read-only calendar)
- `GOOGLE_CALENDAR_ID`

Optional Authentisign API. The live webhook is still a stub until these are implemented and set:

- `LW_USER_ID`
- `LW_ACCESS_TOKEN`
- `LW_SUBSCRIPTION_KEY`
- `LW_WEBHOOK_SECRET`

No Cursor API secret belongs on the Worker unless a future, reviewed integration adds one. Do not reuse the xAI key for Cursor.

## Stored in D1, not in Git

These setting names can hold credentials. Do not export or paste their values into the repository:

- `gcal_refresh_token`
- `gcal_refresh_enc`
- `ics_token`

## Local files that stay untracked

- `.env`
- `.env.admin`
- `.dev.vars`
- `data/` (local SQLite, including CRM data)
- `cfdeploy/` (generated connector payloads)
- `cf/worker.js` and `cf/worker.mjs` (generated bundles)
- `cf/dist/` (generated assets)

How to set them is in `DEPLOY.md`. Scripts read values from the environment and must not print those values.
