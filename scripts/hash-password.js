#!/usr/bin/env node
// Make an admin password hash (PBKDF2-SHA256, 100,000 iterations, random 16-byte salt).
//   node scripts/hash-password.js 'new password'       → prints pbkdf2_sha256$100000$<salt>$<hash>
//   node scripts/hash-password.js                       → reads the password from stdin (keeps it out of shell history)
// The same format is checked by the live Worker (WebCrypto) and the local Express admin (src/auth.js).
// Cloudflare Workers cap PBKDF2 at 100,000 iterations, so don't raise ITER.
const crypto = require('crypto');
const ITER = 100000;
const b64u = (b) => Buffer.from(b).toString('base64url');
function hash(pw) { const salt = crypto.randomBytes(16); return `pbkdf2_sha256$${ITER}$${b64u(salt)}$${b64u(crypto.pbkdf2Sync(pw, salt, ITER, 32, 'sha256'))}`; }
module.exports = { hash };
if (require.main === module) {
  const out = (pw) => { pw = pw.replace(/\r?\n$/, ''); if (!pw) { console.error('Empty password.'); process.exit(1); } console.log(hash(pw)); };
  if (process.argv[2] != null) out(process.argv[2]);
  else { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => out(s)); }
}
