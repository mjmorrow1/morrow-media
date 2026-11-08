// Loads the featured sponsorship campaign from src/campaigns/st-pete-marathon.json.
// Read on every request so edits (enabled / showPricing / copy / tiers) show up on refresh, no restart needed.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'campaigns', 'st-pete-marathon.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { console.error('Campaign file unreadable:', e.message); return { enabled: false, tiers: [] }; }
}
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
module.exports = { load, slugify, FILE };
