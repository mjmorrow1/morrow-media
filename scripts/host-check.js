const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cfg = require('../src/config');
const { wwwFoldTarget } = require('../src/hosts');

assert.strictEqual(cfg.brand, 'SouthBridge Media');
assert.strictEqual(cfg.canonicalHost, 'sbridgemedia.com');
assert.strictEqual(cfg.legacyHost, 'morrowmediagroup.com');
assert.strictEqual(cfg.serviceHost, 'morrowmediagroup.com');
assert.strictEqual(cfg.email, 'sponsors@morrowmediagroup.com');

assert.strictEqual(wwwFoldTarget('www.morrowmediagroup.com'), 'morrowmediagroup.com');
assert.strictEqual(wwwFoldTarget('WWW.MORROWMEDIAGROUP.COM'), 'morrowmediagroup.com');
assert.strictEqual(wwwFoldTarget('www.sbridgemedia.com'), 'sbridgemedia.com');
assert.strictEqual(wwwFoldTarget('morrowmediagroup.com'), '');
assert.strictEqual(wwwFoldTarget('sbridgemedia.com'), '');
assert.strictEqual(wwwFoldTarget('www.www.sbridgemedia.com'), '');
assert.strictEqual(wwwFoldTarget(''), '');

const worker = fs.readFileSync(path.join(__dirname, '../cf/worker-src.js'), 'utf8');
assert.match(worker, /function wwwFoldTarget/);
assert.match(worker, /LEGACY_HOST/);
assert.doesNotMatch(worker, /morrowmediagroup\.com'\) \{ url\.hostname = CANONICAL_HOST/);
const build = fs.readFileSync(path.join(__dirname, '../scripts/build-cf.js'), 'utf8');
assert.match(build, /CANONICAL_HOST: cfg\.canonicalHost/);
assert.match(build, /LEGACY_HOST: cfg\.legacyHost/);
assert.match(build, /SERVICE_HOST: cfg\.serviceHost/);
console.log('host-check ok');
