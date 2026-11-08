// Deploy cf/ (built by scripts/build-cf.js) through the Grok Bot Cloudflare connector — no API token needed on this machine.
// Each step writes a JS file under OUT that the agent runs with the connector's `execute` tool, passing "code": "$file:<path>".
//   1) node scripts/cf-connector-deploy.js manifest                 → OUT/1-manifest.js   (run it with write_to_file; returns the live file manifest)
//   2) node scripts/cf-connector-deploy.js upload <step1-result.txt> → OUT/2-kv-N.js       (only new/changed files; last one deletes removed files + saves manifest)
//   3) node scripts/cf-connector-deploy.js script                   → OUT/3-script.js     (uploads the Worker with KV + D1 bindings, attaches both domains)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'cf/dist');
const OUT = process.env.OUT || '/workspace/cfdeploy';
const SCRIPT = 'morrow-media';
const D1_ID = 'a9500a4a-00ac-4370-94a3-6ac6eb9181fd';   // D1 database "morrow-media-crm"
const KV_ID = 'ad8b4e83b63b4540a64f72d50dc73f7b';       // KV namespace "morrow-media-site"
const ZONE = 'morrowmediagroup.com';
const KV = `/accounts/\${accountId}/storage/kv/namespaces/${KV_ID}`;
fs.mkdirSync(OUT, { recursive: true });
const clear = (n) => { for (const f of fs.readdirSync(OUT)) if (f.startsWith(n + '-')) fs.rmSync(path.join(OUT, f)); };
clear({ manifest: 1, upload: 2, script: 3 }[process.argv[2]]);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : files.push(p); } })(DIST);
const entries = files.map((p) => {
  const buf = fs.readFileSync(p);
  return { key: '/' + path.relative(DIST, p).split(path.sep).join('/'), buf, h: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 20), ct: MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' };
});
const cmd = process.argv[2];

if (cmd === 'manifest') {
  fs.writeFileSync(path.join(OUT, '1-manifest.js'), `async () => { try { const r = await cloudflare.request({ method: 'GET', path: \`${KV}/values/__manifest\` }); return { manifest: typeof r === 'string' ? JSON.parse(r) : r }; } catch (e) { return { manifest: {}, note: String(e.message).slice(0, 200) }; } }`);
  console.log(`→ ${OUT}/1-manifest.js`);
} else if (cmd === 'upload') {
  let live = {};
  if (process.argv[3]) { const s = fs.readFileSync(process.argv[3], 'utf8'); const m = s.match(/\{[\s\S]*\}/); try { live = JSON.parse(m[0]).manifest || {}; } catch { live = {}; } if (live.manifest) live = live.manifest; }
  const changed = entries.filter((e) => live[e.key] !== e.h);
  const removed = Object.keys(live).filter((k) => !entries.some((e) => e.key === k));
  const manifest = Object.fromEntries(entries.map((e) => [e.key, e.h]));
  const LIMIT = Number(process.env.CHUNK_MB || 3) * 1024 * 1024;
  const calls = []; let cur = [], sz = 0;
  for (const e of changed) { const s = e.buf.length * 1.34; if (cur.length && sz + s > LIMIT) { calls.push(cur); cur = []; sz = 0; } cur.push(e); sz += s; }
  if (cur.length || !calls.length) calls.push(cur);
  calls.forEach((c, i) => {
    const last = i === calls.length - 1;
    // Text assets as UTF-8 (base64 bulk can report success without updating values via the connector).
  const pairs = c.map((e) => {
    const text = /^text\/|javascript|json|xml|svg\+xml/i.test(e.ct);
    return text
      ? { key: e.key, value: e.buf.toString('utf8'), metadata: { ct: e.ct, h: e.h } }
      : { key: e.key, value: e.buf.toString('base64'), base64: true, metadata: { ct: e.ct, h: e.h } };
  });
    if (last) pairs.push({ key: '__manifest', value: JSON.stringify(manifest), metadata: { ct: 'application/json' } });
    fs.writeFileSync(path.join(OUT, `2-kv-${i + 1}.js`), `async () => { const pairs = ${JSON.stringify(pairs)};
  const w = await cloudflare.request({ method: 'PUT', path: \`${KV}/bulk\`, body: pairs });
  ${last && removed.length ? `await cloudflare.request({ method: 'POST', path: \`${KV}/bulk/delete\`, body: ${JSON.stringify(removed)} });` : ''}
  return { written: w.result && w.result.successful_key_count, failed: w.result && w.result.unsuccessful_keys, deleted: ${last ? removed.length : 0} }; }`);
  });
  console.log(`${changed.length} new/changed, ${removed.length} removed → ${calls.length} call(s): ${OUT}/2-kv-*.js`);
} else if (cmd === 'script') {
  const worker = fs.readFileSync(path.join(ROOT, 'cf/worker.js'), 'utf8');
  fs.writeFileSync(path.join(OUT, '3-script.js'), `async () => {
  const metadata = { main_module: 'worker.js', compatibility_date: '2025-09-01',
    bindings: [{ type: 'kv_namespace', name: 'SITE', namespace_id: '${KV_ID}' }, { type: 'd1', name: 'DB', id: '${D1_ID}' }], observability: { enabled: true },
    keep_bindings: ['secret_text'] }; // keeps ADMIN_EMAIL / ADMIN_PASS_HASH / SESSION_SECRET (set by 4-secrets.js)
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  fd.append('worker.js', new Blob([${JSON.stringify(worker)}], { type: 'application/javascript+module' }), 'worker.js');
  const up = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/${SCRIPT}\`, body: fd });
  const z = (await cloudflare.request({ method: 'GET', path: '/zones', query: { name: '${ZONE}' } })).result[0];
  const doms = [];
  for (const hostname of ['${ZONE}', 'www.${ZONE}']) {
    try { const d = (await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/domains\`, body: { hostname, service: '${SCRIPT}', zone_id: z.id, environment: 'production' } })).result; doms.push({ hostname: d.hostname, id: d.id }); }
    catch (e) { doms.push({ hostname, error: String(e.message).slice(0, 600) }); }
  }
  return { script: up.result && { id: up.result.id, modified_on: up.result.modified_on }, domains: doms };
}`);
  console.log(`→ ${OUT}/3-script.js`);
} else console.log('usage: manifest | upload [step1-result.txt] | script');
