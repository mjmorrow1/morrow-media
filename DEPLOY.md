# Deploying morrowmediagroup.com

Live: https://morrowmediagroup.com (www.morrowmediagroup.com 301-redirects to it). HTTPS via Cloudflare, Always Use HTTPS on.
The local Express app in this folder is still the source of truth. Edit `src/` and `public/` as usual and check on http://localhost:3000. Then redeploy.

## How it's hosted (Cloudflare free plan, $0/month)
- **Worker `morrow-media`** (`cf/worker.js`, generated from `cf/worker-src.js`). It handles the same routes and redirects as `server.js`:
  - `/portfolio` and `/work` 301 to `/media`; `/legal-services` 301 to `/legal`; `/marketing` 302 to `/media` while hidden.
  - www 301s to the apex domain. `/admin` is a login-protected dashboard (see **Admin dashboard** below).
- **Workers KV `morrow-media-site`** (id ad8b4e83b63b4540a64f72d50dc73f7b) holds every file: pages pre-rendered by `src/pages.js` under `/_pages/*`, plus images, css, js, and fonts.
- **D1 database `morrow-media-crm`** (id a9500a4a-00ac-4370-94a3-6ac6eb9181fd) stores the form submissions. It uses the same tables and columns as `data/crm.sqlite` (schema in `cf/schema.sql`).
- **Custom domains**: morrowmediagroup.com and www.morrowmediagroup.com are attached to the Worker, so DNS and certificates are automatic.
- Free-plan limits: 100k Worker requests/day, 100k KV reads/day (edge-cached), and 1k KV writes/day (a full redeploy writes about 190; a changed-only redeploy writes fewer).

## Admin dashboard — https://morrowmediagroup.com/admin
Sign in with the admin email (sponsors@morrowmediagroup.com) and password. It shows a count per table, the brands / creators / events / sponsors submissions (newest first, every field, times in Eastern), a Delete button per submission (asks to confirm), and a CSV export per table. Legal inquiries are in Brands ("Interested in" starts with "Legal / contracts").
Code: `cf/admin-src.js` (inlined into `cf/worker.js` by the build). You can still browse the raw data in Cloudflare → Storage & Databases → D1 → `morrow-media-crm`.

### How the login works
- The password is **never stored**. The Worker keeps a salted PBKDF2-SHA256 hash (100,000 iterations, WebCrypto; that's the Workers maximum) in encrypted Worker secrets:
  `ADMIN_EMAIL`, `ADMIN_PASS_HASH` (`pbkdf2_sha256$100000$<salt>$<hash>`), and `SESSION_SECRET` (signs cookies). See them under Workers → morrow-media → Settings → Variables and Secrets (values are hidden).
  The deploy step (`3-script.js`) sends `keep_bindings: ['secret_text']`, so redeploys keep the secrets.
- Signing in sets an HMAC-signed cookie `__Host-mm_admin` (HttpOnly, Secure, SameSite=Strict, 7 days). Log out clears it. Changing the password, or rotating `SESSION_SECRET`, signs out every device.
- Every `/admin/*` route needs a valid session. Pages redirect to `/admin/login`; `/admin/api` and `/admin/api/<table>` return 401 JSON. Cross-site POSTs are refused (Origin check). Pages send `noindex`, `no-store`, and a strict CSP. All submission text is HTML-escaped, and CSV cells that start with `= + - @` get a leading `'` so spreadsheets don't run them.
- Failed logins are logged in D1 table `admin_login_fails` (IP, time). 5 fails from one IP (or IPv6 /64) in 15 minutes locks that IP for 15 minutes. 20 fails from all IPs combined in 15 minutes pauses login for everyone for 15 minutes. To unlock right away, run `DELETE FROM admin_login_fails;` in the D1 console.

### Change the password (or the login email)
```
node scripts/hash-password.js                 # type the new password, then Ctrl-D (keeps it out of shell history)
# or: node scripts/hash-password.js 'new password'
```
That prints a hash. Set it as the live secret in either of these ways:
- **Dashboard:** Workers → morrow-media → Settings → Variables and Secrets → `ADMIN_PASS_HASH` → Edit → paste the hash → Deploy.
- **Grok Bot / connector:** `node scripts/hash-password.js | node scripts/cf-admin-secrets.js` writes `/workspace/cfdeploy/4-secrets.js`. Run it with the Cloudflare connector, then delete the file. Add `ADMIN_EMAIL=new@morrowmediagroup.com` in front to change the email, or `--new-session-secret` to also rotate the cookie key.
- Or with wrangler: `npx wrangler secret put ADMIN_PASS_HASH` and paste the hash.
Also put the new hash in `.env.admin` (local) so the local admin matches.

### CRM, follow-up calendar and signings (live /admin)
All of it sits behind the same admin login. Code is in `cf/crm-src.js`, which `scripts/build-cf.js` inlines after `cf/admin-src.js`. The tables are in `cf/crm-schema.sql`. That file is additive (`CREATE … IF NOT EXISTS` only) and is also appended to `cf/schema.sql`.

- **Contacts** (`/admin/contacts`): search, type and stage filters, sort, add, edit, delete, CSV (`/admin/contacts.csv`).
  - Each contact page has a timeline of notes and logged calls, emails, and meetings. Stage changes and completed follow-ups are added to it automatically.
  - Each website submission card has a **Convert to contact** button. It prefills the form and links back to the submission. If the email or submission is already a contact, the card shows **View contact** instead.
- **Follow-ups** (`/admin/calendar`): the page opens on the month grid. The section tabs are Calendar, Agenda, and Sync, in that order. Month, week, and day are controls inside Calendar. Follow-ups stay visually separate from Workspace events and keep Done, Snooze, and `.ics`. `/admin/calendar/settings` is the Sync tab.
  - You can create, edit, complete, reopen, snooze (1 hour, tomorrow 9am, next week), or delete a follow-up.
  - Times are entered and shown in Eastern (`America/New_York`) and stored in UTC.
  - The dashboard shows a widget with overdue and today items.
- **Google Workspace calendar (read-only)**:
  - Admin → Calendar → settings explains the setup when secrets are missing. Connect uses Google OAuth with PKCE, a short-lived `__Host-mm_gcal` state cookie (`SameSite=Lax`, because the admin session cookie is `SameSite=Strict` and is not sent on Google's redirect), and scope `openid email https://www.googleapis.com/auth/calendar.readonly`.
  - Redirect URI: `https://morrowmediagroup.com/admin/calendar/google/callback` (local dev uses the same path on the local origin).
  - Worker secret names: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_TOKEN_KEY`. The refresh token is AES-GCM encrypted with `CALENDAR_TOKEN_KEY` and stored as `settings.gcal_refresh_enc`. It is not sent to the browser. Paste-a-token is refused.
  - Before the first Connect on an existing D1 database, apply the additive `gcal_oauth_states` table from `cf/crm-schema.sql`.
  - The calendar page shows the connected email, a calendar picker, refresh, and disconnect. Events are fetched for the visible range (`singleEvents=true`) and are not written back. A revoked or expired refresh token asks the admin to connect again. This is not live until those secrets exist and an admin completes Connect. Do not copy a token from any other Google connector.
- **Older follow-up write sync** (not enabled by the read-only Connect):
  - If `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set and a write refresh token already exists (`GOOGLE_REFRESH_TOKEN` or `settings.gcal_refresh_token`), creating/updating/snoozing/reopening/completing/deleting a follow-up still creates/updates/deletes the matching event on `sponsors@morrowmediagroup.com` (override with `GOOGLE_CALENDAR_ID`). Scope for that older path: `calendar.events`.
  - The settings page does not offer that write Connect, and it does not send a write test. Sync failures never block CRM saves.
- **Calendar feed** (Admin → Calendar → **iPhone & Google sync**, `/admin/calendar/settings`):
  - There is a private ICS link, `/cal/<token>.ics`, the only unauthenticated admin-data route. It lists every open or snoozed follow-up, each with a 15-minute alert and a stable UID.
  - The token is in D1 `settings.ics_token`. **Regenerate link** replaces it, and the old link returns 404.
  - The settings page has copy buttons, a webcal:// subscribe link, an "Add to Google Calendar" link, and setup steps.
  - Each follow-up also has **+ Calendar**, which downloads a one-off `METHOD:REQUEST` invite (.ics). Use either the feed or invites for a given item, not both.
  - Email invites are not set up yet. To add them later, send `buildInvite()` output as a `text/calendar; method=REQUEST` attachment through a mail provider.
- **Signings** (Authentisign by Lone Wolf, `/admin/signings` plus a section on each contact):
  - **Send for signature** opens https://authentisign.com/ in a new tab.
  - **Log signing** records the document, status (draft, sent, viewed, signed, declined, voided), Authentisign link or reference ID, dates, and notes. Each one is added to the contact's timeline, and status changes are logged too.
  - The Signings page filters by status. The dashboard shows counts per status.
  - Future API: the columns `external_signing_id` and `last_webhook_at` are already in place, and so is `authentisign.createSigning()`. It calls `POST https://api.lwolf.com/authentisign/v3/users/{userId}/signings?api-version=3` as multipart (Name, Files, CallbackUrl) with a `Bearer` token and `lw-subscription-key`. The API is not wired to the UI yet.
  - To enable it, add Worker secrets `LW_USER_ID`, `LW_ACCESS_TOKEN`, `LW_SUBSCRIPTION_KEY`, and `LW_WEBHOOK_SECRET`. Then implement `authentisignWebhook()` so it checks the secret and updates rows by `external_signing_id`.
  - `POST /api/authentisign/webhook` is a public stub that currently returns 501. No credentials are in code.
- **Security:** every `/admin` request needs the session cookie. JSON lives at `/admin/api/{contacts,followups,signings}[/id]`, and requests without a session get 401.
  - Every non-GET request must send a same-origin `Origin` header, or a `Referer` when Origin is missing; otherwise it gets 403. All output is HTML-escaped, and admin pages are noindex and no-store under a nonce CSP.
- **DB migrations:** apply `cf/crm-schema.sql` with the connector's D1 query endpoint, or run `wrangler d1 execute morrow-media-crm --remote --file cf/crm-schema.sql`. Running it again is safe.
- **Worker-only deploys:** when nothing in `public/` changed, run `node scripts/build-cf.js && node scripts/cf-connector-deploy.js script` and then run only `3-script.js`. This skips the KV writes, and the free plan allows 1,000 per day. Secrets are preserved (`keep_bindings`).
- **Local:** run `npm run build:cf && node scripts/worker-dev.js` to serve the real Worker, including the CRM, at http://localhost:8787. It uses a local SQLite file (`data/worker-dev.sqlite`, git-ignored) and the login from `.env.admin`. The Express server (`npm start`) keeps its own local admin.

### Tickets & KPIs (live /admin)

Jira-style tickets and a KPI dashboard on the same Worker, D1 (`morrow-media-crm`) and admin login. Code: `cf/tickets-src.js` (inlined by `scripts/build-cf.js`); tables: `cf/tickets-schema.sql` (projects, tickets, ticket_comments, ticket_history, kpi_goals; additive, `CREATE … IF NOT EXISTS`, seeds project "Morrow Media" / key MM).

- **/admin/tickets**: Kanban board (backlog → to do → in progress → review → done). Drag cards on desktop; on phones each card has a status dropdown + Move. Filters: project, type, priority, label, assignee. Done shows the last 30 days.
- **/admin/tickets?view=list**: backlog/list with search (title, description, labels, contact, or a key like `MM-12`), status filter, overdue-only, and sort.
- **/admin/tickets/:id**: details, simple markdown description (`**bold**`, `` `code` ``, `- ` lists, `# ` headings, https links; everything is escaped first), status quick-set, subtasks, comments, and change history. **/admin/tickets/new** (`?contact_id=`, `?parent_id=`, `?project_id=` prefill).
- **/admin/tickets/projects**: create projects (key is permanent and used in ticket IDs), rename, recolor, archive. Projects with tickets can only be archived.
- **/admin/tickets.csv**: CSV of the current filters (spreadsheet-formula-safe).
- **/admin/kpis**: goals with progress bars (weekly / monthly / quarterly, manual or auto metric), ticket metrics (open by status, done this week/month, overdue, avg cycle time = first "in progress" → done over 90 days, 8-week throughput chart in inline SVG), pipeline (open sponsorship-deal value, won this month), and CRM numbers (new contacts, contacts by stage, follow-ups done/overdue, website submissions). All periods use Eastern time; weeks start Monday. The Home dashboard shows a compact widget.
- Contact pages list linked tickets and have **+ Create ticket**. Deleting a contact or follow-up unlinks tickets (they're kept).
- JSON (GET, login required): `/admin/api/projects`, `/admin/api/tickets[/:id]`, `/admin/api/kpis`, `/admin/api/goals`.
- Same protections as the rest of /admin: session cookie, cross-site POSTs → 403, noindex/no-store, CSP with nonce scripts, output escaped.

Applying the schema to live D1 (already done): run the contents of `cf/tickets-schema.sql` against `morrow-media-crm` (Cloudflare connector `d1/database/<id>/query`, or `wrangler d1 execute morrow-media-crm --remote --file cf/tickets-schema.sql`). Code-only changes: `node scripts/build-cf.js && node scripts/cf-connector-deploy.js script`, then run `3-script.js` (no KV writes).

### Local admin (Express)
`server.js` uses the same login (`src/auth.js`), reading `ADMIN_EMAIL`, `ADMIN_PASS_HASH`, and `SESSION_SECRET` from the environment or from the git-ignored `.env.admin`. That file holds only the hash and a local session key, never the password. Local `/admin` still also only answers on localhost. It keeps its extra tools (add records, change status, campaigns, packages).

## Redeploy after content edits
```
npm run redeploy        # = ./scripts/redeploy.sh
```
This builds `cf/dist` and `cf/worker.js` and writes the deploy steps to `/workspace/cfdeploy/`. Grok Bot then runs them with the Cloudflare connector, in this order:
1. `1-manifest.js`: fetches the live file list (save the result to a file).
2. `./scripts/redeploy.sh <that file>`: generates `2-kv-*.js` with only new or changed files; removed files are deleted.
3. Run `2-kv-*.js`, then `3-script.js` (Worker code + bindings + domains). If step 2 reports `0 new/changed`, skip the KV call to save KV writes (only `__manifest` would be rewritten). Worker-only changes (e.g. `cf/admin-src.js`) need only `node scripts/build-cf.js && node scripts/cf-connector-deploy.js script` and then `3-script.js`.

Just ask: "redeploy the website".
If you add a form field/table, run the new `CREATE TABLE`/`ALTER TABLE` on D1 too (`cf/schema.sql` is regenerated by the build).

### Site AI — Grok chatbot (/admin/ai)

Admin-only chat where Matt can ask Grok to change live site copy and CSS. Code: `cf/ai-src.js`; tables: `cf/ai-schema.sql` (`ai_messages`, `ai_proposals`, `site_overrides`).

- **UI:** Admin nav → **Site AI**. Chat history, pending proposal with Apply / Discard, list of live overrides with Revert.
- **Flow:** message → xAI Grok (`grok-4.7`) proposes JSON find/replace patches on allowlisted paths → dry-run must match exactly once → **Apply** writes `site_overrides` in D1 → Worker serves override before KV (`x-mm-override: 1`).
- **Allowlist:** `/_pages/*.html` marketing pages + `/css/site.css` only. No admin/auth/forms.
- **Secret:** Worker `XAI_API_KEY` (from [console.x.ai](https://console.x.ai)). Set with `echo -n 'xai-...' | node scripts/cf-xai-secret.js` then run `4-xai-secret.js` via the Cloudflare connector and delete the file. Without the secret the page loads but chat is disabled.
- **Screenshots:** The composer accepts up to 3 PNG, JPEG, or WebP images, 1 MB each. They are sent only on that chat request, using xAI's documented chat-completions `image_url` data URL, and are not written to KV, D1, or the repository. Typed text still works with no image. xAI's published image types for this endpoint are JPEG and PNG; WebP uses the same content part.
- **Migration:** apply `cf/ai-schema.sql` to D1 `morrow-media-crm` (additive). Redeploy the Worker after.
- **Source of truth:** overrides are live until reverted or a full KV redeploy replaces the underlying file (override still wins until Revert). Sync important edits back into `src/` / `public/` when you can.

## Admin setup guide (`/admin/setup`)

Read-only checklist for administrators. Source: `cf/setup-src.js` (inlined by `scripts/build-cf.js`). It uses the existing admin login, navigation, and security headers.

Change a status only after a new check, and say what was observed. Do not mark GitHub import, mail, or an optional integration complete just because this page exists. The page does not save checkboxes or call providers. Preview with `node scripts/worker-dev.js`, then `npm run setup-guide-check`. Publishing it to the live Worker is a separate deploy and is not part of editing the checklist. Secret names are in `SECRETS.md`; never put values in the guide.
