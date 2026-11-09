const cfg = require('./config');

function wwwFoldTarget(hostname, apexes = [cfg.canonicalHost, cfg.legacyHost]) {
  const host = String(hostname || '').toLowerCase();
  for (const apex of apexes) {
    if (apex && host === 'www.' + apex) return apex;
  }
  return '';
}

module.exports = { wwwFoldTarget };
