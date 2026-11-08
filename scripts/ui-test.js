// Browser-level test: open the creator application, submit it, submit each contact tab, confirm rows, clean up.
const { chromium } = require('playwright-core');
const { db } = require('../src/db');
const base = process.env.BASE || 'http://localhost:3000';
const E = 'uitest@test.local';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(base + '/creators');
  await p.click('.page-hero [data-open-apply]');
  await p.waitForTimeout(800);
  const f = p.locator('#apply-panel form');
  await f.locator('[name=name]').fill('UI Test Creator'); await f.locator('[name=email]').fill(E);
  await f.locator('[name=instagram]').fill('@uitest'); await f.getByText('Travel', { exact: true }).click();
  await f.locator('button[type=submit]').click();
  await p.waitForSelector('#apply-panel .form-msg.ok'); console.log('creator (Creator Network page):', await p.textContent('#apply-panel .form-msg'));
  for (const [tab, fields] of [['brand', { company: 'UI Test Co', contact_name: 'T' }], ['creator', { name: 'UI Test 2' }], ['event', { event_name: 'UI Test Fest', organizer: 'T' }]]) {
    await p.goto(base + '/contact');
    await p.click(`[data-tab=${tab}]`);
    const panel = p.locator(`[data-panel=${tab}]`);
    for (const [k, v] of Object.entries(fields)) await panel.locator(`[name=${k}]`).fill(v);
    await panel.locator('[name=email]').fill(E);
    await panel.locator('button[type=submit]').click();
    await panel.locator('.form-msg.ok').waitFor(); console.log(`contact tab ${tab}: OK`);
  }
  // Lightbox on featured listings
  await p.goto(base + '/media#real-estate');
  await p.locator('[data-gallery=trillium] .lg-item').nth(2).click();
  await p.waitForSelector('.lightbox.open');
  const c1 = await p.textContent('.lightbox figcaption span');
  await p.keyboard.press('ArrowRight'); const c2 = await p.textContent('.lightbox figcaption span');
  const ok = await p.evaluate(() => { const i = document.querySelector('.lightbox img'); return i.complete && i.naturalWidth > 0 ? i.naturalWidth : 0; });
  await p.keyboard.press('Escape'); const closed = !(await p.locator('.lightbox.open').count());
  console.log(`lightbox: ${c1} → ${c2}, image ${ok}px wide, closes on Esc: ${closed}`);
  const broken = await p.evaluate(async () => { const urls = [...new Set([...document.querySelectorAll('[data-lb]')].map((e) => e.dataset.lb).concat([...document.images].map((i) => i.src)))]; const bad = []; for (const u of urls) { const r = await fetch(u); if (!r.ok) bad.push(u); } return `${urls.length} urls, ${bad.length} broken ${bad.join(' ')}`; });
  console.log('media page images:', broken);
  // /portfolio is gone → 301 to /media; nav has Legal, not Work
  await p.goto(base + '/portfolio');
  console.log('/portfolio lands on:', p.url().replace(base, ''), '| nav:', (await p.locator('.nav a').allTextContents()).join(' · '));
  // Marketing hidden → /marketing lands on /media; no /marketing links anywhere on the page (nav, mobile menu, footer)
  await p.goto(base + '/marketing');
  console.log('/marketing lands on:', p.url().replace(base, ''), '| /marketing links on page:', await p.locator('a[href^="/marketing"]').count());
  await p.goto(base + '/about');
  console.log('about h1:', JSON.stringify(await p.locator('h1').innerText()), '| does items:', await p.locator('.does-item').count(), '| quote:', await p.locator('.about-quote').count(), '| photos:', await p.locator('.about-photo img, .founder-photo').count());
  // Legal page: disclaimer + real consultation form submit lands in Brands, tagged Legal / contracts
  await p.goto(base + '/legal');
  console.log('legal practice areas:', await p.locator('.legal-area').count(), '| disclaimer:', await p.locator('.legal-disclaimer').count(), '| notice:', await p.locator('.legal-notice').count(), '| counsel line (empty config → hidden):', await p.locator('.legal-counsel').count());
  const lf = p.locator('#consultation form');
  await lf.locator('[name=contact_name]').fill('UI Test Legal'); await lf.locator('[name=email]').fill(E); await lf.locator('[name=matter]').selectOption('LLC formation & structure'); await lf.locator('[name=details]').fill('UI test');
  await lf.locator('button[type=submit]').click(); await p.waitForSelector('#consultation .form-msg.ok');
  console.log('legal form saved:', JSON.stringify(db.prepare("SELECT company, contact_name, interests, goals, source FROM brands WHERE email = ? AND source LIKE '%legal%'").get(E)));
  // St. Pete Marathon campaign: tier CTA preselects the tier, then a real form submit lands in Sponsors
  await p.goto(base + '/sponsorships');
  console.log('tier cards:', await p.locator('.tier').count(), '| featured:', await p.textContent('.tier.featured .tier-name'), '| prices:', (await p.locator('.tier-price').allTextContents()).join(' '));
  await p.click('a[data-tier="Inner Circle"]'); await p.waitForTimeout(900);
  console.log('CTA preselects tier:', await p.inputValue('[data-tier-select]'), '| url:', p.url().replace(base, ''));
  const sf = p.locator('#sponsor-inquiry form');
  await sf.locator('[name=company]').fill('UI TEST Sponsor'); await sf.locator('[name=contact_name]').fill('UI Test'); await sf.locator('[name=email]').fill(E);
  await sf.locator('[name=phone]').fill('555-0101'); await sf.locator('[name=industry]').selectOption('Health & Fitness'); await sf.locator('[name=budget]').selectOption('$2K–$5K'); await sf.locator('[name=notes]').fill('UI test');
  await sf.locator('button[type=submit]').click(); await p.waitForSelector('#sponsor-inquiry .form-msg.ok');
  const sp = db.prepare('SELECT company, campaign, tier, status, source FROM sponsors WHERE email=?').get(E);
  console.log('sponsor form saved:', JSON.stringify(sp));
  await p.goto(base + '/');
  console.log('home teaser:', (await p.textContent('.campaign-teaser .ct-line')).trim(), '→', await p.getAttribute('.campaign-teaser a', 'href'));
  await p.goto(base + '/admin');
  console.log('admin dashboard shows:', (await p.locator('table tbody tr').count()), 'recent rows');
  await b.close();
  const n = ['brands', 'creators', 'events', 'sponsors'].map((t) => db.prepare(`DELETE FROM ${t} WHERE email=?`).run(E).changes);
  console.log('deleted test rows (brands, creators, events, sponsors):', n.join(', '));
})();
