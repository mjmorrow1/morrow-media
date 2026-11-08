#!/usr/bin/env node
// Write the connector step that sets the admin secrets on the live Worker (Cloudflare "secret_text" — encrypted, never shown again).
//   node scripts/hash-password.js 'new password' | node scripts/cf-admin-secrets.js           → OUT/4-secrets.js (ADMIN_PASS_HASH + ADMIN_EMAIL)
//   ... | node scripts/cf-admin-secrets.js --new-session-secret                               → also rotates SESSION_SECRET (signs everyone out)
//   ADMIN_EMAIL=someone@morrowmediagroup.com ... to change the login email.
// Run OUT/4-secrets.js with the connector's execute tool, then DELETE the file (it holds the hash and session secret).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const OUT = process.env.OUT || '/workspace/cfdeploy';
const email = (process.env.ADMIN_EMAIL || 'sponsors@morrowmediagroup.com').trim().toLowerCase();
let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => {
  const h = s.trim();
  if (!/^pbkdf2_sha256\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]{43}$/.test(h)) { console.error('Pipe in a hash from scripts/hash-password.js'); process.exit(1); }
  const secrets = [{ name: 'ADMIN_EMAIL', text: email }, { name: 'ADMIN_PASS_HASH', text: h }];
  if (process.argv.includes('--new-session-secret')) secrets.push({ name: 'SESSION_SECRET', text: crypto.randomBytes(32).toString('base64url') });
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, '4-secrets.js');
  fs.writeFileSync(f, `async () => { const out = []; for (const s of ${JSON.stringify(secrets)}) { const r = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/morrow-media/secrets\`, body: { ...s, type: 'secret_text' } }); out.push({ name: r.result && r.result.name, ok: r.success }); } return out; }`, { mode: 0o600 });
  console.log(`→ ${f} (sets ${secrets.map((x) => x.name).join(', ')}). Run it with the connector, then delete it.`);
});
