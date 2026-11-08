#!/usr/bin/env node
// Write connector step that sets Google Calendar OAuth secrets on the morrow-media Worker.
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... [GOOGLE_REFRESH_TOKEN=...] [GOOGLE_CALENDAR_ID=sponsors@...] \
//     node scripts/cf-google-secrets.js
// Then run OUT/4-google-secrets.js with the Cloudflare connector execute tool and DELETE the file.
const fs = require('fs'); const path = require('path');
const OUT = process.env.OUT || '/workspace/cfdeploy';
const id = (process.env.GOOGLE_CLIENT_ID || '').trim();
const secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const refresh = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
const cal = (process.env.GOOGLE_CALENDAR_ID || 'sponsors@morrowmediagroup.com').trim();
if (!id || !secret) { console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'); process.exit(1); }
const secrets = [
  { name: 'GOOGLE_CLIENT_ID', text: id },
  { name: 'GOOGLE_CLIENT_SECRET', text: secret },
  { name: 'GOOGLE_CALENDAR_ID', text: cal },
];
if (refresh) secrets.push({ name: 'GOOGLE_REFRESH_TOKEN', text: refresh });
fs.mkdirSync(OUT, { recursive: true });
const f = path.join(OUT, '4-google-secrets.js');
fs.writeFileSync(f, `async () => { const out = []; for (const s of ${JSON.stringify(secrets)}) { const r = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/morrow-media/secrets\`, body: { ...s, type: 'secret_text' } }); out.push({ name: r.result && r.result.name, ok: r.success }); } return out; }`, { mode: 0o600 });
console.log(`→ ${f} (sets ${secrets.map((x) => x.name).join(', ')}). Run with Cloudflare connector, then delete.`);
