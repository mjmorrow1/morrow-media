#!/usr/bin/env node
const { home, contact } = require('../src/pages');
const html = home();
const start = html.indexOf('id="website-pricing"');
const photo = html.indexOf('id="photography-media"');
if (start < 0 || photo < 0 || start > photo) {
  console.error('pricing is not above Photography and Media');
  process.exit(1);
}
const between = html.slice(start, photo);
const after = html.slice(photo, photo + 400);
if (!after.includes('Photography and Media')) {
  console.error('photography heading missing');
  process.exit(1);
}
const fail = [];
const need = [
  'Website pricing',
  'Build', '$99', 'one-time', 'Host', 'per month',
  '1 Google Workspace account and email',
  'A lite dashboard where you submit your own change requests',
  'Setup', 'Monthly', '$299',
  'Workspace calendar', 'Contact management',
  'Behind-the-scenes backend web development',
  'Full-service AI-driven editing for changes',
  'Contact us for pricing',
  'How many Google Workspace accounts you need',
  'Customer relationship management',
  'Inventory',
  'Merchandise storefronts, including ecommerce sites',
  'plan=essentials', 'plan=managed', 'plan=custom',
  'Ask about Essentials', 'Ask about Managed', 'Ask about Custom',
];
for (const n of need) if (!between.includes(n)) fail.push('missing ' + n);
if ((between.match(/\$99/g) || []).length !== 3) fail.push('$99 count ' + (between.match(/\$99/g) || []).length);
if ((between.match(/\$299/g) || []).length !== 1) fail.push('$299 count');
const ess = between.slice(between.indexOf('Essentials'), between.indexOf('Managed'));
const man = between.slice(between.indexOf('Managed'), between.indexOf('Custom'));
const cus = between.slice(between.indexOf('>Custom<'));
if (/AI-driven|unlimited|free trial|Workspace calendar/.test(ess)) fail.push('essentials has an unstated inclusion');
if (/1 Google Workspace account/.test(man)) fail.push('managed inherited the single account');
if (/\$99|\$299|AI-driven/.test(cus)) fail.push('custom invented a price or inclusion');
if ((cus.match(/Contact us for pricing/g) || []).length !== 1) fail.push('custom price line');
for (const bad of ['free trial', 'unlimited', 'Google Partner', 'turnaround', 'domain name', 'hidden fee']) {
  if (between.toLowerCase().includes(bad.toLowerCase())) fail.push('invented: ' + bad);
}
const inquiry = contact('brand', 'essentials');
if (!inquiry.includes('Website pricing: Essentials. $99 to build, one-time, and $99 a month to host.')) fail.push('plan context not on the brand form');
if (contact('brand', 'nope').includes('Website pricing:')) fail.push('unknown plan was accepted');
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log('website pricing checks passed');
