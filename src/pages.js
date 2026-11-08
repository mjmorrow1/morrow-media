const cfg = require('./config');
const C = require('./content');
const { layout, esc } = require('./layout');
const { brandForm, creatorForm, eventForm, sponsorForm, legalForm } = require('./forms');
const campaign = require('./campaign');
const CREDITS = require('./credits');

// While a page is switched off in config.pages, its pillar card points to the brand inquiry form instead.
const pillarsLive = () => C.pillars.map((p) => ((cfg.pages || {})[p.key] === false
  ? { ...p, href: '/contact?type=brand', cta: 'Start a campaign' } : p));

const arrow = '<span class="arr" aria-hidden="true">→</span>';
const list = (items, cls = 'svc-list') => `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
const img = (src, alt, cls = '') => `<img class="${cls}" src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async">`;


const featuredListing = (l, i) => `
<article class="listing reveal" data-gallery="${l.slug}">
  <button class="listing-lead" data-lb="${l.lead.full}" data-alt="${esc(l.lead.alt)}" aria-label="Open ${esc(l.address)} gallery">
    <img src="${l.lead.full}" alt="${esc(l.lead.alt)}" loading="lazy" decoding="async">
  </button>
  <div class="listing-info">
    <p class="eyebrow">Case study ${String(i + 1).padStart(2, '0')}</p>
    <h3 class="listing-title">${esc(l.address)}</h3>
    <p class="listing-facts">${esc(l.facts)}</p>
    <p class="listing-caption">${esc(l.caption)}</p>
    <ul class="listing-tags">${l.services.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  </div>
  <div class="listing-grid">
    ${l.gallery.map((g) => `<button class="lg-item" data-lb="${g.full}" data-alt="${esc(g.alt)}" aria-label="View: ${esc(g.alt)}"><img src="${g.thumb}" alt="${esc(g.alt)}" loading="lazy" decoding="async"></button>`).join('')}
  </div>
</article>`;

const pageHero = ({ eyebrow, title, sub, image, cta }) => `
<section class="page-hero${image ? ' with-img' : ''}">
  ${image ? `<div class="page-hero-media">${img(image, '')}</div>` : ''}
  <div class="wrap page-hero-inner reveal">
    ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
    <h1 class="display">${title}</h1>
    ${sub ? `<p class="lede">${sub}</p>` : ''}
    ${cta || ''}
  </div>
</section>`;

const pricingNote = () => `
<section class="section pricing-note">
  <div class="wrap narrow reveal">
    <p class="eyebrow">Packages</p>
    <h2 class="h2 serif">Every campaign is different. Let's build the right package for your goals.</h2>
    <a class="btn btn-solid" href="/contact">Work with us</a>
  </div>
</section>`;

// Home: Packages (left) + Creative media statement (right)
const packagesStatementRow = () => `
<section class="section packages-statement" id="packages">
  <div class="wrap">
    <div class="ps-panel reveal">
      <div class="packages-statement-row">
        <div class="ps-packages">
          <p class="eyebrow">Packages</p>
          <h2 class="h2">Every campaign is different. Let's build the right package for your goals.</h2>
          <a class="btn btn-solid" href="/contact">Work with us</a>
        </div>
        <div class="ps-divider" aria-hidden="true"></div>
        <div class="ps-statement" id="statement">
          <p class="eyebrow">${esc(cfg.tagline)}</p>
          <p class="statement-text">${esc(cfg.oneLiner)}</p>
        </div>
      </div>
      <div class="package-verticals" aria-label="Service verticals">
        <p class="package-vert"><span class="pv-n">01</span>Website Creation</p>
        <p class="package-vert"><span class="pv-n">02</span>Photography and Media</p>
        <p class="package-vert"><span class="pv-n">03</span>Sponsorship</p>
      </div>
    </div>
  </div>
</section>`;

const packageVerticals = () => ''; // folded into packagesStatementRow

const ctaBand = (title, label, href) => `
<section class="cta-band">
  <div class="wrap reveal">
    <h2 class="display-sm">${title}</h2>
    <a class="btn btn-light" href="${href}">${label}</a>
  </div>
</section>`;


function photographyVertical() {
  return `<section class="section dark" id="photography-media">
  <div class="wrap two-col reveal">
    <div>
      <p class="eyebrow light">Vertical</p>
      <h2 class="display-sm">Photography and Media</h2>
      <p class="lede-sm">Photography, video, drone, and social-first content — shot and edited in-house so your brand looks the way it should on location and online.</p>
      <div class="vert-pills">
        <p class="badge">In-house photo + video</p>
        <p class="badge">FAA Part 107 drone</p>
        <p class="badge">Social-first edits</p>
      </div>
      <a class="btn btn-light" href="/contact?type=brand">Book a production</a>
    </div>
    <div>${list(C.pillars[0].items, 'svc-list cols light')}</div>
  </div>
</section>`;
}

function websiteVertical() {
  return `<section class="section dark" id="website-creation">
  <div class="wrap two-col reveal">
    <div>
      <p class="eyebrow light">Vertical</p>
      <h2 class="display-sm">Website Creation</h2>
      <p class="lede-sm">Custom brand sites for companies that need more than a template — positioning, design, and build that match how they actually work.</p>
      <p class="badge">Design + development in-house</p>
      <a class="btn btn-light" href="/contact?type=brand">Start a website project</a>
    </div>
    <div>${list(C.webServices, 'svc-list cols light')}</div>
  </div>
</section>`;
}

function featuredWebsite(w) {
  const compare = w.compare;
  let media;
  if (compare && compare.before && compare.after) {
    const side = (side, key, delay) => {
      // Before clear; After under ~58% veil + hover hint; hover clears veil
      const revealCls = key === 'after' ? ' ba-reveal ba-after' : ' ba-before';
      const hint = key === 'after'
        ? `<div class="ba-hover-hint" aria-hidden="true"><span>Hover to reveal</span></div>`
        : '';
      return `
    <a class="ba-side${revealCls}" href="${side.href}" target="_blank" rel="noopener noreferrer" aria-label="${esc(side.caption || key)}"${key === 'after' ? ` style="--d:${delay}ms"` : ''}>
      <div class="ba-frame">
        <span class="ba-label">${esc(key === 'before' ? 'Before' : 'After')}</span>
        <img src="${side.img}" alt="${esc(side.alt || side.caption || w.label)}" loading="lazy" decoding="async">
        ${hint}
      </div>
      <p class="ba-caption"><strong>${esc(side.caption || key)}</strong>${side.note ? `<span>${esc(side.note)}</span>` : ''}</p>
    </a>`;
    };
    const compareId = (w.id || w.label || 'compare').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-compare';
    media = `
  <div class="ba-compare" id="${compareId}" data-ba-compare>
    ${side(compare.before, 'before', 0)}
    ${side(compare.after, 'after', 80)}
  </div>`;
  } else {
    media = `
  <a class="listing-lead" href="${w.href}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${esc(w.label)}">
    <img src="${w.img}" alt="${esc(w.alt || w.label)}" loading="lazy" decoding="async">
  </a>`;
  }
  const links = compare
    ? `<div class="ba-links">
    <a class="link" href="${compare.before.href}" target="_blank" rel="noopener noreferrer">Old site ${arrow}</a>
    <a class="link" href="${w.href}" target="_blank" rel="noopener noreferrer">${esc(w.cta || 'Visit new site')} ${arrow}</a>
  </div>`
    : `<a class="link" href="${w.href}" target="_blank" rel="noopener noreferrer">${esc(w.cta || 'Visit site')} ${arrow}</a>`;
  // Compare: project text ABOVE Before|After; After veil/hint handled in CSS
  return `
<article class="listing web-example${compare ? ' web-example-compare' : ' reveal'}">
  <div class="listing-info${compare ? ' reveal' : ''}">
    <p class="web-tag">${esc(w.tag || 'Website')}</p>
    <h3 class="listing-title">${esc(w.label)}</h3>
    <p class="listing-caption">${esc(w.copy)}</p>
    ${links}
  </div>
  ${media}
</article>`;
}

// ───────────── HOME ─────────────
function home() {
  const cards = pillarsLive().map((p, i) => `
    <a class="pillar-card reveal" style="--d:${i * 80}ms" href="${p.href}">
      <div class="pc-media">${img(p.img, p.title)}</div>
      <div class="pc-body">
        <p class="pc-num">0${i + 1}</p>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.copy)}</p>
        <span class="link">${esc(p.cta)} ${arrow}</span>
      </div>
    </a>`).join('');

  const steps = C.steps.map((s, i) => `
    <li class="step reveal" style="--d:${i * 90}ms">
      <span class="step-n">${s.n}</span><span class="step-line"></span>
      <h3>${s.t}</h3><p>${s.d}</p>
    </li>`).join('');

  const showcaseItem = (s, i) => {
    const href = s.href || '/media';
    const external = /^https?:\/\//i.test(href);
    const attrs = external
      ? ` href="${href}" target="_blank" rel="noopener noreferrer"`
      : ` href="${href}"`;
    const cta = s.cta || 'View work';
    const eyebrow = s.tag ? esc(s.tag) : String(i + 1).padStart(2, '0');
    return `
    <a class="showcase-item reveal${i % 2 ? ' flip' : ''}"${attrs}>
      <div class="si-media">${img(s.img, s.alt || s.label)}</div>
      <div class="si-copy"><p class="eyebrow">${eyebrow}</p><h3 class="h2">${esc(s.label)}</h3><p>${esc(s.copy)}</p><span class="link">${esc(cta)} ${arrow}</span></div>
    </a>`;
  };
  const photoShow = C.showcase.photography.items.map(showcaseItem).join('');
  const webExamples = C.showcase.websites.items.map(featuredWebsite).join('');

  const body = `
<section class="hero">
  <div class="hero-media"><img src="${C.images.hero}" srcset="${C.images.heroMobile} 1280w, ${C.images.hero} 2400w" sizes="100vw" alt="Downtown St. Petersburg, Florida skyline at sunset, seen from Demens Landing Park" fetchpriority="high"></div>
  <div class="hero-shade"></div>
  <div class="wrap hero-inner">
    <p class="eyebrow light hero-eyebrow">${esc(cfg.brand)} · ${esc(cfg.location)}</p>
    <h1 class="hero-title"><span>MEDIA.</span> <span>MARKETING.</span> <span>PARTNERSHIPS.</span></h1>
    <p class="hero-sub">We create compelling content and connect brands, creators, and events to build campaigns that get noticed.</p>
    <div class="hero-ctas"><a class="btn btn-light" href="/contact">Work with us</a><a class="btn btn-ghost-light" href="/media">View our work</a></div>
  </div>
  <div class="hero-foot wrap"><span>Media</span><span>Marketing</span><span>Creators</span><span>Sponsorships</span></div>
  <a class="photo-credit" href="/credits">${esc(CREDITS.byKey.hero.short)}</a>
</section>
${campaignTeaser()}

${packagesStatementRow()}
${websiteVertical()}
<section class="section pt-0" id="web-examples">
  <div class="wrap">
    <header class="featured-head reveal">
      <div class="featured-head-main">
        <p class="eyebrow">Website creation</p>
        <h2 class="h2">Featured sites</h2>
      </div>
      <p class="featured-head-lede">Our featured customers customized websites.</p>
    </header>
    ${webExamples}
  </div>
</section>
${photographyVertical()}
<section class="section examples-of-work">
  <div class="wrap">
    <div class="section-head split reveal"><div><p class="eyebrow">Photography &amp; media</p><h2 class="h2">Work behind the camera.</h2></div><a class="link" href="/media">View our work ${arrow}</a></div>
    <div class="showcase">${photoShow}</div>
  </div>
</section>

<section class="section pt-0">
  <div class="wrap">
    <a class="founder-strip reveal" href="/about#founder">
      <img src="${C.images.founder}" alt="Matt Morrow" loading="lazy" decoding="async">
      <p><span class="eyebrow">Founded by Matt Morrow</span><span class="founder-strip-line">The agent, the creator, and the developer, based in St. Pete.</span></p>
      <span class="link">Meet Matt ${arrow}</span>
    </a>
  </div>
</section>

<section class="section soft">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Work with us</p><h2 class="h2">Start where you are.</h2></div>
    <div class="entry-grid">
      <a class="entry reveal" href="/contact?type=brand"><p class="eyebrow">For brands &amp; businesses</p><h3>I'm a Brand</h3><p>Content, social, creators, and campaigns built around your goals.</p><span class="link">Start a campaign ${arrow}</span></a>
      <a class="entry reveal" style="--d:80ms" href="/creators#apply"><p class="eyebrow">For creators</p><h3>I'm a Creator</h3><p>Join the network for sponsored, tourism, and hospitality campaigns.</p><span class="link">Join the network ${arrow}</span></a>
      <a class="entry reveal" style="--d:160ms" href="/contact?type=event"><p class="eyebrow">For events</p><h3>I'm an Event Organizer</h3><p>Sponsors, media, and creator activation for your event.</p><span class="link">Talk about your event ${arrow}</span></a>
    </div>
  </div>
</section>

<section class="section pt-0" id="what-we-do">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">What we do</p><h2 class="h2">Four ways we move a brand forward.</h2></div>
    <div class="pillar-grid">${cards}</div>
  </div>
</section>

<section class="section dark how" id="how-it-works">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow light">How it works</p><h2 class="h2">More than a shoot. A campaign.</h2></div>
    <ol class="steps">${steps}</ol>
  </div>
</section>`;
  return layout({ path: '/', body, heroNav: true });
}

// ───────────── SERVICES ─────────────
function services() {
  const blocks = pillarsLive().map((p, i) => `
    <article class="svc-block reveal">
      <div class="svc-media">${img(p.img, p.title)}</div>
      <div class="svc-copy">
        <p class="eyebrow">0${i + 1}</p>
        <h2 class="h2">${esc(p.title)}</h2>
        <p class="lede-sm">${esc(p.copy)}</p>
        ${list(p.items)}
        <a class="link" href="${p.href}">${esc(p.cta)} ${arrow}</a>
      </div>
    </article>`).join('');
  const body = `
${pageHero({ eyebrow: 'Services', title: 'Media. Marketing.<br>Creators. Sponsorships.', sub: esc(cfg.positioning) })}
<section class="section pt-0"><div class="wrap svc-stack">${blocks}</div></section>
${pricingNote()}`;
  return layout({ title: 'Services', path: '/services', body });
}

// ───────────── MEDIA ─────────────
function media() {
  const p = C.pillars[0];
  const body = `
${pageHero({ eyebrow: 'Media &amp; Creative', title: 'Content that makes<br>your brand stand out.', sub: esc(p.copy), image: C.images.media, cta: '<a class="btn btn-light" href="/contact?type=brand">Book a production</a>' })}
${websiteVertical()}
<section class="section soft" id="web-examples">
  <div class="wrap">
    <header class="featured-head reveal">
      <div class="featured-head-main">
        <p class="eyebrow">Website creation</p>
        <h2 class="h2">Featured sites</h2>
      </div>
      <p class="featured-head-lede">Our featured customers customized websites.</p>
    </header>
    ${C.showcase.websites.items.map(featuredWebsite).join('')}
  </div>
</section>
<section class="section dark" id="real-estate">
  <div class="wrap two-col reveal">
    <div>
      <p class="eyebrow light">Vertical</p>
      <h2 class="display-sm">Real Estate Media</h2>
      <p class="lede-sm">Listing media for agents, brokerages, and developers — photography, aerials, and social-first video that sells the property and builds the agent's brand.</p>
      <p class="badge">FAA Part 107 certified drone services</p>
      <a class="btn btn-light" href="/contact?type=brand">Book a listing shoot</a>
    </div>
    <div>${list(C.realEstate, 'svc-list cols light')}</div>
  </div>
</section>
<section class="section listings" id="featured-listings">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Real Estate Media</p><h2 class="h2">Featured listings</h2><p class="muted">Recent listing shoots across Southwest Florida and Tampa Bay.</p></div>
    ${C.listings.map(featuredListing).join('')}
  </div>
</section>
<section class="section">
  <div class="wrap two-col reveal">
    <div><p class="eyebrow">Production</p><h2 class="h2">Photo, video, drone, and social-first content.</h2></div>
    <div>${list(p.items, 'svc-list cols')}</div>
  </div>
</section>
${ctaBand('Need content that performs?', 'Work with us', '/contact?type=brand')}`;
  return layout({ title: 'Media', path: '/media', body, heroNav: true });
}

// ───────────── MARKETING ─────────────
function marketing() {
  const pillars = [
    ['Strategy', 'Understand the audience and objectives.'],
    ['Content', 'Create the visual assets.'],
    ['Distribution', 'Get the content in front of the right people.'],
    ['Partnerships', 'Use creators, brands, and events to expand reach.'],
  ];
  const body = `
${pageHero({ eyebrow: 'Marketing &amp; Social', title: 'Strategy first.<br>Then everything else.', sub: esc(C.pillars[1].copy), image: C.images.marketing })}
<section class="section">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Our approach</p><h2 class="h2">Four parts of one plan.</h2></div>
    <div class="quad">${pillars.map(([t, d], i) => `<div class="quad-item reveal" style="--d:${i * 80}ms"><span class="step-n">0${i + 1}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  </div>
</section>
<section class="section soft">
  <div class="wrap two-col reveal">
    <div><p class="eyebrow">Services</p><h2 class="h2">What's included.</h2></div>
    <div>${list(C.pillars[1].items, 'svc-list cols')}</div>
  </div>
</section>
${ctaBand('Let\'s build the plan.', 'Start a campaign', '/contact?type=brand')}`;
  return layout({ title: 'Marketing', path: '/marketing', body, heroNav: true });
}

// ───────────── CREATOR NETWORK ─────────────

function creatorNetwork() {
  const ig = '<svg class="ig-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor"/></svg>';
  const rows = C.creatorAccounts.map((a, i) => `
    <article class="net-row reveal" style="--d:${i * 60}ms">
      <div class="net-meta">
        <a class="net-id" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">
          <img class="net-avatar${a.avatarRound ? ' round' : ''}" src="${esc(a.avatar)}" alt="${esc(a.name)} profile picture" width="64" height="64" loading="lazy">
          <span><span class="net-handle">@${esc(a.handle)}</span><span class="net-name">${esc(a.name)}</span></span>
        </a>
        <p class="net-tag">${esc(a.tag)}</p>
        <p class="net-desc">${esc(a.desc)}</p>
        <a class="link net-link" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${ig}View on Instagram<span class="sr-only"> (opens in a new tab)</span></a>
      </div>
      <div class="net-grid">${a.images.map((im) => `<a class="net-tile${im.wide ? ' wide' : ''}" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" tabindex="-1"><img${im.pos ? ` class="${esc(im.pos)}"` : ''} src="${esc(im.src)}" alt="${esc(im.alt)}" loading="lazy"></a>`).join('')}</div>
    </article>`).join('');
  return `<section class="section network" id="network">
  <div class="wrap">
    <div class="net-head reveal"><p class="eyebrow">Our network</p><h2 class="h2">Featured accounts.</h2><p class="muted">Creators and partners already producing in St. Pete: underwater and wildlife work, local photo and drone, and the city's waterfront marathon.</p></div>
    <div class="net-list">${rows}
    </div>
  </div>
</section>`;
}
function creators() {
  const collage = [
    { cls: 'cc-travel', cat: 'Travel', src: '/images/creators/collage/travel.webp', alt: 'Two hikers on a windy snow ridge above a sea of clouds. Example of travel photography, not a member of this network.' },
    { cls: 'cc-fitness', cat: 'Fitness', src: '/images/creators/collage/fitness.webp', alt: 'A large outdoor yoga class on a city lawn. Example of fitness photography, not a member of this network.' },
    { cls: 'cc-food', cat: 'Food', src: '/images/creators/collage/food.webp', alt: 'Strawberries in a glass bowl on striped cloth. Example of food photography, not a member of this network.' },
    { cls: 'cc-video', cat: 'Video', src: '/images/creators/collage/video.webp', alt: 'A camera operator filming with a cinema camera outdoors. Example of video work, not a member of this network.' },
    { cls: 'cc-studio', cat: 'Art', src: '/images/creators/collage/studio.webp', alt: 'A painter at an easel beside the water. Example of artwork being made, not a member of this network.' },
  ];
  const tiles = collage.map((t) => `<li class="cc-tile ${t.cls}"><figure><img src="${t.src}" alt="${esc(t.alt)}" width="1400" decoding="async"><figcaption>${esc(t.cat)}</figcaption></figure></li>`).join('');
  const body = `
<section class="page-hero creator-hero">
  <div class="wrap creator-hero-grid">
    <div class="creator-hero-copy">
      <p class="eyebrow">Creator Network</p>
      <h1 class="display" id="creators-title">Creators wanted.</h1>
      <p class="lede">Join our network of photographers, influencers, videographers, and content creators.</p>
      <ul class="creator-platforms" aria-label="Platforms">
        <li><img src="/images/icons/instagram.svg" alt="" width="18" height="18"><span>Instagram</span></li>
        <li><img src="/images/icons/tiktok.svg" alt="" width="18" height="18"><span>TikTok</span></li>
        <li><img src="/images/icons/youtube.svg" alt="" width="18" height="18"><span>YouTube</span></li>
      </ul>
      <a class="btn btn-solid" href="#apply" data-open-apply>Join the Creator Network</a>
      <p class="creator-hero-note">These photographs are examples of the kinds of work. They are not members of this network, and they are not endorsements. The platform names say where creators publish. They are not partnerships.</p>
    </div>
    <ul class="creator-collage" aria-label="Example photographs of travel, fitness, food, video, and art">
      ${tiles}
    </ul>
  </div>
  <p class="creator-hero-credit wrap">Photographs by Jakub Hałun, Rhododendrites, W.carter, Maria Eklind, and Christian Senger, via Wikimedia Commons. <a href="/credits">Photo credits and licenses</a></p>
</section>
${creatorNetwork()}
<section class="section">
  <div class="wrap two-col reveal">
    <div><p class="eyebrow">Opportunities</p><h2 class="h2">Get matched with brands, events, and destinations.</h2></div>
    <div>${list(C.creatorOpportunities, 'svc-list big')}</div>
  </div>
</section>
<section class="section soft apply" id="apply">
  <div class="wrap narrow">
    <div class="section-head reveal"><p class="eyebrow">Application</p><h2 class="h2">Join the Creator Network</h2><p class="muted">Instagram, TikTok, and YouTube creators — travel, food, lifestyle, and local. Tell us about your audience and we'll reach out when there's a fit.</p></div>
    <button class="btn btn-solid apply-toggle" data-open-apply aria-controls="apply-panel" aria-expanded="false">Open application</button>
    <div class="apply-panel" id="apply-panel" data-apply-panel>${creatorForm()}</div>
  </div>
</section>
<section class="section dark">
  <div class="wrap two-col reveal">
    <div><p class="eyebrow light">For brands</p><h2 class="h2">Creator &amp; influencer partnerships.</h2><p class="lede-sm">${esc(C.pillars[2].copy)}</p><a class="btn btn-light" href="/contact?type=brand">Start a campaign</a></div>
    <div>${list(C.pillars[2].items, 'svc-list cols light')}</div>
  </div>
</section>`;
  return layout({ title: 'Creator Network', path: '/creators', body });
}

// ───────────── BRANDS ─────────────
function brands() {
  const opts = [
    ['CREATE', 'Professional content.', '/media', '/images/placeholders/pf-product.jpg'],
    ['CONNECT', 'Influencers and creators.', '/creators', '/images/placeholders/card-creators.jpg'],
    ['ACTIVATE', 'Events and sponsorships.', '/sponsorships', '/images/placeholders/pf-event-gala.jpg'],
  ];
  const biz = ['Restaurants', 'Hotels', 'Real estate professionals', 'Property developers', 'Tourism', 'Automotive', 'Retail', 'Hospitality', 'Local businesses'];
  const body = `
${pageHero({ eyebrow: 'For brands', title: 'Need people to<br>see your brand?', sub: 'We connect brands with the creators, content, events, and audiences that align with their goals.', cta: '<a class="btn btn-solid" href="/contact?type=brand">Start a campaign</a>' })}
<section class="section pt-0">
  <div class="wrap tri">${opts.map(([t, d, h, im], i) => `<a class="tri-card reveal" style="--d:${i * 80}ms" href="${h}"><div class="tri-media">${img(im, t)}</div><h3>${t}</h3><p>${d}</p></a>`).join('')}</div>
</section>
<section class="section soft">
  <div class="wrap two-col reveal">
    <div><p class="eyebrow">Who we work with</p><h2 class="h2">Built for brands that live on experience.</h2></div>
    <div>${list(biz, 'svc-list cols')}</div>
  </div>
</section>
${ctaBand('Ready to be seen?', 'Start a campaign', '/contact?type=brand')}`;
  return layout({ title: 'Brands', path: '/brands', body });
}

// ───────────── SPONSORSHIPS ─────────────
function sponsorships(preTier = '') {
  const events = ['Festivals', 'Concerts', 'Sporting events', 'Conferences', 'Charity events', 'Nightlife', 'Tourism events', 'Private events'];
  const body = `
${featuredCampaign(preTier)}
<section class="section">
  <div class="wrap two-col reveal">
    <div><p class="eyebrow">For event organizers</p><h2 class="h2">From sponsor deck to signed partner — and the content after.</h2></div>
    <div>${list(C.sponsorshipServices, 'svc-list big')}</div>
  </div>
</section>
<section class="section soft">
  <div class="wrap two-col reveal">
    <div><p class="eyebrow">For brands</p><h2 class="h2">Activate around experiences people care about.</h2><p class="muted">Brand/event matchmaking, experiential campaigns, influencer activation, and event media production.</p></div>
    <div><p class="eyebrow">Events we work with</p>${list(events, 'svc-list cols')}</div>
  </div>
</section>
${ctaBand('Have an event with an audience?', 'Talk about your event', '/contact?type=event')}`;
  return layout({ title: 'Events & Sponsorships', path: '/sponsorships', body });
}

// ───────────── LEGAL ─────────────
// Legal services come from an INDEPENDENT attorney at law. Morrow Media is not a law firm; keep the disclaimers.
function legal() {
  const L = cfg.legal || {};
  const counsel = [L.attorneyName, L.firmName].filter(Boolean).map(esc).join(' · ');
  const counselLine = counsel ? `<p class="legal-counsel"><span>Independent counsel</span>${L.website ? `<a href="${esc(L.website)}" target="_blank" rel="noopener noreferrer">${counsel}</a>` : counsel}${L.bar ? ` <em>${esc(L.bar)}</em>` : ''}</p>` : '';
  const oneLine = 'Legal services are provided by an independent attorney, not Morrow Media. Submitting this form does not create an attorney-client relationship.';
  const areas = C.legal.areas.map((a, i) => `
    <article class="legal-area reveal" style="--d:${(i % 2) * 70}ms">
      <p class="eyebrow">${a.n}</p>
      <h3 class="h3">${esc(a.title)}</h3>
      <p class="muted">${esc(a.copy)}</p>
      ${list(a.items)}
    </article>`).join('');
  const steps = C.legal.steps.map((s, i) => `
    <li class="step reveal" style="--d:${i * 90}ms">
      <span class="step-n">${s.n}</span><span class="step-line"></span>
      <h3>${esc(s.t)}</h3><p>${esc(s.d)}</p>
    </li>`).join('');
  const body = `
${pageHero({ eyebrow: 'Legal · Independent counsel', title: 'The paperwork behind<br>every partnership.', sub: 'LLC formation, sponsor contracts, creator agreements, and event paperwork, handled by an independent attorney at law who works alongside our campaigns.', cta: '<a class="btn btn-solid" href="#consultation">Request a consultation</a>' })}
<section class="section pt-0">
  <div class="wrap">
    <aside class="legal-notice reveal" aria-label="Important legal notice">
      <p class="eyebrow">Important</p>
      <p><strong>Morrow Media is not a law firm and does not provide legal advice.</strong> Legal services on this page are provided by an independent attorney at law who is not an employee of Morrow Media. Any engagement is made directly between you and the attorney.</p>
    </aside>
    ${counselLine}
  </div>
</section>
<section class="section pt-0">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Practice areas</p><h2 class="h2">Built for brands, creators, sponsors, and events.</h2><p class="muted">The legal side of the work we do every day, from forming the LLC to signing the sponsor.</p></div>
    <div class="legal-grid">${areas}</div>
  </div>
</section>
<section class="section dark how">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow light">How it works</p><h2 class="h2">A direct line to counsel.</h2></div>
    <ol class="steps">${steps}</ol>
  </div>
</section>
<section class="section soft" id="consultation">
  <div class="wrap two-col">
    <div class="reveal"><p class="eyebrow">Consultation</p><h2 class="h2">Request a consultation.</h2><p class="muted">Tell us what you're working on: an LLC, a sponsor contract, a creator agreement, or an event. We'll connect you with our independent counsel.</p><p class="legal-oneline">${oneLine}</p></div>
    <div>${legalForm()}</div>
  </div>
</section>
<section class="section legal-disclaimer">
  <div class="wrap narrow">
    <h2 class="h3">Disclaimer</h2>
    <p>Morrow Media is a media and marketing company. It is not a law firm, does not practice law, and does not provide legal advice. Legal services described on this page are provided solely by an independent attorney at law who is not an employee, partner, or agent of Morrow Media and who exercises independent professional judgment.</p>
    <p>Using this website, reading this page, or submitting a form does not create an attorney-client relationship with the attorney or with Morrow Media. An attorney-client relationship is formed only by a written engagement made directly with the attorney. Until then, please don't send confidential or time-sensitive information.</p>
    <p>Information on this page is general in nature, is not legal advice, and is not a guarantee of any result. The hiring of a lawyer is an important decision that should not be based solely upon advertisements.</p>
  </div>
</section>`;
  return layout({ title: 'Legal', path: '/legal', body, description: 'LLC, sponsorship, creator, and event agreements through an independent attorney at law. Morrow Media is not a law firm.' });
}


// ───────────── FEATURED SPONSORSHIP CAMPAIGN (data: src/campaigns/st-pete-marathon.json) ─────────────
function featuredCampaign(preTier = '') {
  const c = campaign.load();
  if (!c.enabled) return '';
  const slugTier = (c.tiers.find((t) => campaign.slugify(t.name) === campaign.slugify(preTier)) || {}).name || '';
  const cards = c.tiers.map((t) => `
      <article class="tier${t.featured ? ' featured' : ''}">
        ${t.badge ? `<p class="tier-badge">${esc(t.badge)}</p>` : ''}
        <h3 class="tier-name">${esc(t.name)}</h3>
        ${c.showPricing ? `<p class="tier-price">${esc(t.price)}</p>` : '<p class="tier-price tier-price-hidden">Pricing on request</p>'}
        <ul class="tier-list">${t.benefits.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <a class="btn ${t.featured ? 'btn-gold' : 'btn-ghost-light'} tier-cta" href="/sponsorships?tier=${campaign.slugify(t.name)}#sponsor-inquiry" data-tier="${esc(t.name)}">Become a ${esc(t.name)} Sponsor</a>
      </article>`).join('');
  return `
<section class="campaign" id="${esc(c.id)}" aria-labelledby="campaign-title">
  <div class="campaign-hero">
    <picture><source media="(max-width:760px)" srcset="${c.heroImageMobile}"><img src="${c.heroImage}" alt="${esc(c.heroImageAlt)}" loading="lazy" decoding="async"></picture>
    <div class="campaign-hero-inner wrap reveal">
      <img class="campaign-logo" src="${c.logo}" alt="St. Pete Marathon logo" width="160" height="159">
      <div>
        <p class="eyebrow light"><span class="live-dot" aria-hidden="true"></span>Featured client campaign · ${esc(c.eyebrow)}</p>
        <h2 class="campaign-title" id="campaign-title">${esc(c.eyebrow)}: <span>${esc(c.title)}</span></h2>
        <p class="campaign-meta"><span>${esc(c.date)}</span><span>${esc(c.location)}</span><span>Start/finish: ${esc(c.startFinish)}</span></p>
      </div>
    </div>
    <a class="photo-credit" href="/credits">${esc(c.heroCredit)}</a>
  </div>
  <div class="campaign-body">
    <div class="wrap">
      <div class="two-col campaign-intro reveal">
        <div>${c.pitch.map((p, i) => `<p class="${i === 0 ? 'lede-sm' : 'muted-light'}">${esc(p)}</p>`).join('')}</div>
        <dl class="facts facts-dark">${c.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </div>
      <div class="section-head reveal"><p class="eyebrow light">Partnership tiers</p><h3 class="h2">Founding partnerships for the inaugural race.</h3></div>
      <div class="tier-grid">${cards}</div>
      <p class="campaign-note">${esc(c.processedBy)} Morrow Media coordinates sponsor inquiries on behalf of the St. Pete Marathon.</p>
    </div>
  </div>
  <div class="section soft" id="sponsor-inquiry">
    <div class="wrap two-col reveal">
      <div><p class="eyebrow">Sponsor inquiry · ${esc(c.client)}</p><h3 class="h2">Reserve your partnership.</h3><p class="muted">Tell us about your brand and the tier you're considering. We'll follow up with next steps for the St. Pete Marathon.</p></div>
      <div>${sponsorForm(c, slugTier)}</div>
    </div>
  </div>
</section>`;
}

function campaignTeaser() {
  const c = campaign.load();
  if (!c.enabled) return '';
  return `
<section class="campaign-teaser">
  <a class="wrap ct-inner" href="/sponsorships#${esc(c.id)}">
    <img src="${c.logo}" alt="" width="56" height="56">
    <p><span class="eyebrow light"><span class="live-dot" aria-hidden="true"></span>Current campaign</span><span class="ct-line">${esc(c.eyebrow)}: ${esc(c.title)}</span><span class="ct-meta">${esc(c.date)} · ${esc(c.location)}</span></p>
    <span class="link light">See partnership tiers ${arrow}</span>
  </a>
</section>`;
}

// ───────────── CREDITS ─────────────
function credits() {
  const rows = CREDITS.list.map((c) => `
    <div class="credit-row">
      <img src="${c.thumb}" alt="" loading="lazy">
      <div><h3>${esc(c.title)}</h3><p class="muted">Used on: ${esc(c.usedOn)}</p>
      <p>Photo by ${esc(c.author)} · <a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a> · <a href="${esc(c.source)}" target="_blank" rel="noopener">Source (Wikimedia Commons)</a>${c.changes ? ` · ${esc(c.changes)}` : ''}</p></div>
    </div>`).join('');
  const body = `
${pageHero({ eyebrow: 'Credits', title: 'Photo credits.', sub: 'Third-party photographs used on this site, with their authors and licenses. All other photography is our own unless noted. Instagram, TikTok, and YouTube marks on the Creator Network page are the standard glyphs from Simple Icons (CC0), in the published colors, and name those platforms only. The marks are trademarks of their owners.' })}
<section class="section pt-0"><div class="wrap credits">${rows}</div></section>`;
  return layout({ title: 'Photo credits', path: '/credits', body });
}

// ───────────── ABOUT ─────────────
function about() {
  const A = C.about, F = C.founder;
  const tc = (t) => esc(t).replace('Travelers Content', `<a class="inline" href="${esc(cfg.social.instagram)}" target="_blank" rel="noopener">Travelers Content</a>`);
  const story = A.story.map((t, i) => `<p class="${i ? 'muted' : 'lede-sm'}">${i === 3 ? tc(t) : esc(t)}</p>`).join('');
  const does = A.does.map(([k, v], i) => `<div class="does-item reveal" style="--d:${(i % 3) * 80}ms"><h3>${esc(k)}</h3><p>${esc(v)}</p></div>`).join('');
  const body = `
${pageHero({ eyebrow: 'About', title: A.headline.map(esc).join('<br>'), sub: esc(A.lede) })}
<section class="section pt-0">
  <div class="wrap two-col about reveal">
    <div class="about-photo">${img(C.images.about, 'Matt Morrow, founder of Morrow Media, shooting with a Sony camera among the palms')}</div>
    <div class="about-copy">${story}</div>
  </div>
</section>
<section class="section soft founder" id="founder">
  <div class="wrap founder-card about-founder reveal">
    <img class="founder-photo" src="${C.images.founder}" alt="Portrait of Matt Morrow" loading="lazy" decoding="async">
    <div class="founder-body">
      <p class="eyebrow">${esc(F.role)}</p>
      <h2 class="h2">${esc(F.name)}</h2>
      <p class="founder-meta">${esc(cfg.location)}</p>
    </div>
    <div class="about-copy">${A.founder.map((t) => `<p class="muted">${esc(t)}</p>`).join('')}</div>
  </div>
</section>
<section class="section dark">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow light">Services</p><h2 class="h2">${esc(A.doesTitle)}</h2></div>
    <div class="does-grid">${does}</div>
  </div>
</section>
<section class="section statement about-closing">
  <div class="wrap reveal">
    <p class="about-closing-lead">${esc(A.closing[0])}</p>
    <p class="statement-text serif">${esc(A.closing[1])}</p>
  </div>
</section>
${ctaBand('Let\'s work together.', 'Work with us', '/contact')}`;
  return layout({ title: 'About', path: '/about', body });
}

// ───────────── CONTACT ─────────────
function contact(type = 'brand') {
  if (!['brand', 'creator', 'event'].includes(type)) type = 'brand';
  const tabs = [
    ['brand', "I'm a Brand", 'For businesses and companies.', brandForm()],
    ['creator', "I'm a Creator", 'For influencers and content creators.', creatorForm()],
    ['event', "I'm an Event Organizer", 'For events looking for sponsors or media.', eventForm()],
  ];
  const body = `
${pageHero({ eyebrow: 'Contact', title: 'Let\'s build something.', sub: 'Every campaign is different. Let\'s build the right package for your goals.' })}
<section class="section pt-0">
  <div class="wrap">
    <div class="tabs" role="tablist">${tabs.map(([k, l, d]) => `<button role="tab" class="tab${k === type ? ' active' : ''}" aria-selected="${k === type}" data-tab="${k}"><strong>${l}</strong><span>${d}</span></button>`).join('')}</div>
    ${tabs.map(([k, l, , form]) => `<div class="tab-panel${k === type ? ' active' : ''}" role="tabpanel" data-panel="${k}"><h2 class="h3 panel-title">${l}</h2>${form}</div>`).join('')}
    <p class="muted contact-alt">Prefer email or a call? <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>${cfg.phone ? ` · <a href="tel:${esc(cfg.phoneTel)}">${esc(cfg.phone)}</a>` : ''} · ${esc(cfg.location)}</p>
  </div>
</section>`;
  return layout({ title: 'Contact', path: '/contact', body });
}

function thanks() {
  const body = `${pageHero({ eyebrow: 'Received', title: 'Thank you.', sub: 'We\'ll be in touch shortly.', cta: '<a class="btn btn-solid" href="/">Back home</a>' })}`;
  return layout({ title: 'Thank you', body });
}

function notFound() {
  return layout({ title: 'Not found', body: pageHero({ eyebrow: '404', title: 'Nothing here.', cta: '<a class="btn btn-solid" href="/">Back home</a>' }) });
}

module.exports = { credits, home, services, media, marketing, creators, brands, sponsorships, legal, about, contact, thanks, notFound };
