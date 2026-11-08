// Full-page screenshots (desktop + mobile) with headless Chrome via playwright-core.
const { chromium } = require('playwright-core');
const path = require('path');
const base = process.env.BASE || 'http://localhost:3000';
const out = path.join(__dirname, '..', 'screenshots');
const shots = [
  ['home', '/'], ['services', '/services'], ['media', '/media'], ['creators', '/creators'],
  ['sponsorships', '/sponsorships'], ['legal', '/legal'], ['contact', '/contact'], ['about', '/about'], ['credits', '/credits'], ['admin-packages', '/admin/packages'],
];
const mobile = ['home', 'creators', 'legal', 'contact', 'media', 'about', 'sponsorships'];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [label, vp, list] of [['desktop', { width: 1440, height: 900 }, shots.map((s) => s[0])], ['mobile', { width: 390, height: 844 }, mobile]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: label === 'mobile' ? 2 : 1, isMobile: label === 'mobile', hasTouch: label === 'mobile' });
    const page = await ctx.newPage();
    for (const [name, url] of shots.filter((s) => list.includes(s[0]) && (!process.env.ONLY || process.env.ONLY.split(',').includes(s[0])))) {
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 450) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 160)); }
        document.querySelectorAll('.reveal,.step').forEach((el) => el.classList.add('in'));
        document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1600);
      const file = path.join(out, `${name}-${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
      if (name === 'media') { const f3 = path.join(out, `media-real-estate-${label}.png`); const el = page.locator('#real-estate'); const box1 = await el.boundingBox(); const box2 = await page.locator('#featured-listings').boundingBox(); await page.screenshot({ path: f3, fullPage: true, clip: { x: 0, y: box1.y, width: vp.width, height: box2.y + box2.height - box1.y } }); console.log(f3); }
      if (name === 'sponsorships') { const f4 = path.join(out, `sponsorships-campaign-${label}.png`); const bx = await page.locator('#st-pete-marathon').boundingBox(); await page.screenshot({ path: f4, fullPage: true, clip: { x: 0, y: bx.y, width: vp.width, height: bx.height } }); console.log(f4); }
      if (name === 'about' && label === 'desktop') { const f5 = path.join(out, 'nav-desktop.png'); await page.screenshot({ path: f5, clip: { x: 0, y: 0, width: vp.width, height: 90 } }); console.log(f5); }
      if (name === 'home') { const f2 = path.join(out, `home-hero-${label}.png`); await page.screenshot({ path: f2 }); console.log(f2); }
    }
    await ctx.close();
  }
  await browser.close();
})();
