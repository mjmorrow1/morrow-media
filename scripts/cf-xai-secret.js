#!/usr/bin/env node
// Write connector step to set XAI_API_KEY on the morrow-media Worker.
//   echo -n 'xai-...' | node scripts/cf-xai-secret.js
//   XAI_API_KEY='xai-...' node scripts/cf-xai-secret.js
// Run OUT/4-xai-secret.js with Cloudflare connector execute, then DELETE it.
const fs = require('fs'); const path = require('path');
const OUT = process.env.OUT || '/workspace/cfdeploy';
let key = (process.env.XAI_API_KEY || '').trim();
const finish = () => {
  if (!key || key.length < 20) { console.error('Pass XAI_API_KEY env or pipe the key on stdin'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, '4-xai-secret.js');
  fs.writeFileSync(f, `async () => { const r = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/morrow-media/secrets\`, body: { name: 'XAI_API_KEY', text: ${JSON.stringify(key)}, type: 'secret_text' } }); return { name: r.result && r.result.name, ok: r.success }; }`, { mode: 0o600 });
  console.log(`→ ${f} (sets XAI_API_KEY). Run with connector, then delete.`);
};
if (key) finish();
else { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => { key = s.trim(); finish(); }); }
