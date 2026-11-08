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
  '1 Google Workspace email account',
  'Hosting for the site',
  'A lite dashboard where you submit your own change requests',
  'This plan does not include full-service editing',
  'Setup', 'Monthly', '$299',
  'A dashboard for a business overview and access to the tools',
  'Workspace calendar to view schedules and events in the dashboard',
  'Contact management to organize people and follow-ups',
  'Behind-the-scenes backend development to maintain and evolve the site',
  'Full-service AI-assisted website editing for requested content and layout changes',
  'Contact us for pricing',
  'The number of Google Workspace accounts is scoped to what you need',
  'Customer relationship management workflows',
  'Inventory',
  'Merchandise and ecommerce storefront needs',
  'plan=essentials', 'plan=premium', 'plan=custom',
  'Ask about Essentials', 'Ask about Premium', 'Ask about Custom',
];
for (const n of need) if (!between.includes(n)) fail.push('missing ' + n);
if (between.includes('Managed') || between.includes('plan=managed')) fail.push('old Managed name remains');
if ((between.match(/\$99/g) || []).length !== 3) fail.push('$99 count ' + (between.match(/\$99/g) || []).length);
if ((between.match(/\$299/g) || []).length !== 1) fail.push('$299 count');
const ess = between.slice(between.indexOf('Essentials'), between.indexOf('Premium'));
const mid = between.slice(between.indexOf('Premium'), between.indexOf('>Custom<'));
const cus = between.slice(between.indexOf('>Custom<'));
if (/AI-assisted|Workspace calendar|unlimited|free trial/.test(ess)) fail.push('essentials has an unstated inclusion');
if (!/does not include full-service editing/.test(ess)) fail.push('essentials does not say editing is not included');
if (/1 Google Workspace email account/.test(mid)) fail.push('premium inherited the single email account');
if (/\$99|\$299|AI-assisted/.test(cus)) fail.push('custom invented a price or inclusion');
if ((cus.match(/Contact us for pricing/g) || []).length !== 1) fail.push('custom price line');
for (const bad of ['free trial', 'unlimited', 'Google Partner', 'turnaround', 'domain name', 'hidden fee']) {
  if (between.toLowerCase().includes(bad.toLowerCase())) fail.push('invented: ' + bad);
}
const inquiry = contact('brand', 'essentials');
if (!inquiry.includes('Website pricing: Essentials. $99 to build, one-time, and $99 a month to host.')) fail.push('plan context not on the brand form');
if (contact('brand', 'nope').includes('Website pricing:')) fail.push('unknown plan was accepted');
if (!contact('brand', 'premium').includes('Website pricing: Premium. $99 setup, one-time, and $299 a month.')) fail.push('premium plan context');
if (contact('brand', 'managed').includes('Website pricing:')) fail.push('old managed plan still accepted');
if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log('website pricing checks passed');
