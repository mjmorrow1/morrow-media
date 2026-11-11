// Site content that's likely to change: images, service lists, legal page copy, internal packages.
// PLACEHOLDER images live in /public/images/placeholders — see README for the swap list.
const P = '/images/placeholders/';

const images = {
  hero: '/images/stpete/hero-demens-landing-sunset.webp',        // REAL photo, CC BY 2.0 (see CREDITS.md)
  heroMobile: '/images/stpete/hero-demens-landing-sunset-1280.webp',
  media: P + 'card-media.jpg',
  marketing: P + 'card-marketing.jpg',
  creators: P + 'card-creators.jpg',
  sponsorships: '/images/campaigns/st-pete-marathon/pillar.webp', // St. Pete Marathon campaign visual
  about: '/images/about/matt-camera.webp',      // REAL photo of Matt (data-src/about/matt-camera.jpg)
  founder: '/images/about/matt-portrait.webp', // REAL headshot, black phone bars cropped out
};

const pillars = [
  { key: 'media', label: 'Media', title: 'MEDIA', href: '/media', cta: 'Explore Media', img: images.media,
    copy: 'Photography, video, drone, and social-first content designed to make your brand stand out.',
    items: ['Professional photography', 'Videography', 'Drone photography & video', 'Real estate media', 'Event photography & video', 'Corporate / business photography', 'Product photography', 'Short-form video', 'Reels / TikTok content', 'Social media graphics', 'Content production'] },
  { key: 'marketing', label: 'Marketing', title: 'MARKETING', href: '/marketing', cta: 'Explore Marketing', img: images.marketing,
    copy: 'Strategy, social media, creative direction, and campaigns built around your goals.',
    items: ['Social media strategy', 'Social media management', 'Content strategy', 'Instagram strategy', 'TikTok strategy', 'Campaign development', 'Brand consulting', 'Event marketing', 'Content calendars', 'Creative direction'] },
  { key: 'creators', label: 'Creators', title: 'CREATOR PARTNERSHIPS', href: '/creators', cta: 'Explore Partnerships', img: images.creators,
    copy: 'We connect brands with creators who reach the audiences that matter.',
    items: ['Influencer identification', 'Creator matchmaking', 'Brand / creator campaigns', 'Influencer negotiations', 'Creator management', 'Campaign coordination', 'Deliverable management', 'Performance reporting'] },
  { key: 'sponsorships', label: 'Sponsorships', title: 'SPONSORSHIPS & EVENTS', href: '/sponsorships', cta: 'Explore Sponsorships', img: images.sponsorships,
    copy: 'We help events attract sponsors and brands activate around experiences people care about.',
    items: ['Sponsorship acquisition', 'Sponsorship strategy', 'Sponsor packages', 'Brand / event matchmaking', 'Event marketing', 'Influencer activation', 'Experiential campaigns', 'Event media production'] },
];

const steps = [
  { n: '01', t: 'DISCOVER', d: 'We learn about your brand, audience, goals, and campaign.' },
  { n: '02', t: 'CREATE', d: 'We produce photography, video, social content, and creative assets.' },
  { n: '03', t: 'CONNECT', d: 'We bring in the right creators, brands, sponsors, or event partners.' },
  { n: '04', t: 'AMPLIFY', d: 'We distribute the campaign and measure the results.' },
];

const webServices = ['Brand websites', 'Landing pages', 'Site redesigns', 'Copy & positioning', 'UI / UX design', 'Web applications', 'Hosting & Cloudflare deploy', 'Maintenance & updates', 'Analytics & forms', 'SEO foundations'];

const realEstate = ['MLS photography', 'Interior / exterior photography', 'Aerial photography', 'Aerial video', 'Property video tours', 'Vertical listing reels', 'Twilight photography', 'Social media content', 'Agent branding', 'Listing marketing'];

const sponsorshipServices = ['Sponsorship strategy', 'Sponsor prospecting', 'Sponsor packages', 'Pitch materials', 'Sponsor outreach', 'Negotiation', 'Influencer activation', 'Event content', 'Campaign reporting'];

const creatorOpportunities = ['Sponsored campaigns', 'Events', 'Product collaborations', 'Tourism campaigns', 'Hospitality campaigns', 'Content production'];

const showcase = {
  websites: {
    eyebrow: 'Website creation',
    title: 'Sites we build.',
    items: [
      { label: 'Tango Two One', id: 'tango-two-one', copy: 'Brand website for an aviation and aerospace engineering firm — positioning, design, and build. Side-by-side: the old live site vs the new Morrow Media build.', img: '/images/work/tango-two-one-after.webp', alt: 'Tango Two One Engineering — new Morrow Media website', href: 'https://tangotwoone.pages.dev/', cta: 'Visit new site', tag: 'Website redesign',
        compare: {
          before: { img: '/images/work/tango-two-one-before.webp', alt: 'Previous Tango Two One live site at tangotwoone.com', caption: 'Before — tangotwoone.com', href: 'https://www.tangotwoone.com/', note: 'Old live site' },
          after:  { img: '/images/work/tango-two-one-after.webp',  alt: 'New Tango Two One site built by Morrow Media', caption: 'After', href: 'https://tangotwoone.pages.dev/', note: 'New Morrow Media build' },
        } },
      { label: 'Neurons Away', id: 'neurons-away', copy: 'Brand and commerce site for a publisher of books, journals, and creative activities that build mental flexibility — positioning, design, and build. Side-by-side: the old Weebly site vs the new Morrow Media build.', img: '/images/work/neuronsaway-after.webp', alt: 'Neurons Away — new Morrow Media website', href: 'https://neuronsaway.pages.dev/', cta: 'Visit new site', tag: 'Website redesign',
        compare: {
          before: { img: '/images/work/neuronsaway-before.webp', alt: 'Previous Neurons Away live site at neuronsaway.com', caption: 'Before — neuronsaway.com', href: 'https://www.neuronsaway.com/', note: 'Old Weebly site' },
          after:  { img: '/images/work/neuronsaway-after.webp',  alt: 'New Neurons Away site built by Morrow Media', caption: 'After', href: 'https://neuronsaway.pages.dev/', note: 'New Morrow Media build' },
        },
      },
    ],
  },
  photography: {
    eyebrow: 'Photography & media',
    title: 'Work behind the camera.',
    items: [
      { label: 'REAL ESTATE', copy: 'Professional property photography + aerial imagery + social-first video.', img: '/images/listings/sea-horse/01.webp', href: '/media#real-estate', tag: 'Photography' },
    ],
  },
};

// INTERNAL ONLY — shown in /admin/packages, never on the public site.
const packages = [
  { name: 'Content Session', summary: 'Photography + short-form video', includes: ['Half- or full-day shoot', 'Edited photo set', '3–5 vertical videos', 'Usage for web + social'], pricing: 'TBD — set starting rate', model: 'Production' },
  { name: 'Social Content', summary: 'Monthly photo / video / reels package', includes: ['Monthly shoot day', 'Photo set + reels', 'Content calendar', 'Optional posting / management'], pricing: 'TBD — monthly retainer', model: 'Retainer' },
  { name: 'Real Estate Media', summary: 'Photography + drone + video', includes: ['MLS photo set', 'Aerial photo + video (FAA Part 107)', 'Property video tour', 'Vertical listing reel', 'Twilight add-on'], pricing: 'TBD — per listing, tiered by sq ft', model: 'Production' },
  { name: 'Event Media', summary: 'Photography + video + social', includes: ['Event coverage (photo + video)', 'Same-day social edits', 'Recap film', 'Creator activation add-on'], pricing: 'TBD — hourly / day rate', model: 'Production' },
  { name: 'Creator Campaign', summary: 'Creator sourcing + negotiation + management', includes: ['Creator shortlist from network', 'Negotiation + contracts', 'Deliverable management', 'Performance report'], pricing: 'TBD — management fee (% of creator spend) + setup', model: 'Campaign management' },
  { name: 'Sponsorship Campaign', summary: 'Sponsor acquisition + campaign management', includes: ['Sponsor deck + packages', 'Prospecting + outreach', 'Negotiation', 'Activation + reporting'], pricing: 'TBD — retainer + commission on sponsorship revenue', model: 'Sponsorship commission' },
];

const revenueModel = [
  ['Production', 'Charge for photography / video / drone / content.'],
  ['Retainers', 'Monthly social / content / marketing.'],
  ['Campaign management', 'Management fee on influencer campaigns.'],
  ['Sponsorship commissions', 'A percentage of sponsorship revenue generated.'],
  ['Creator management', 'Commission on deals sourced / managed.'],
];

// /legal — practice areas offered through an INDEPENDENT attorney at law (not Morrow Media).
// Keep this descriptive: no prices, outcomes, credentials or names here (attorney details live in config.legal).
const legal = {
  areas: [
    { n: '01', title: 'LLC formation & structure', copy: 'Set the business up properly from day one, and keep it in good standing.',
      items: ['LLC formation and filings', 'Operating agreements', 'Multi-member and partner agreements', 'Registered agent and annual compliance', 'Amendments, ownership changes, and dissolution'] },
    { n: '02', title: 'Sponsorship & partnership contracts', copy: 'Clear agreements between our clients and their sponsors, so every partner knows exactly what they get.',
      items: ['Sponsorship agreements by tier', 'Deliverables, placement, and exclusivity', 'Morals and termination clauses', 'Payment terms and schedules', 'Renewals and options'] },
    { n: '03', title: 'Creator & talent agreements', copy: 'Agreements for creators, influencers, and talent working on brand and event campaigns.',
      items: ['Usage rights and content licensing', 'Name, image, and likeness', 'Influencer disclosure (FTC endorsement guides)', 'Deliverables, approvals, and timelines'] },
    { n: '04', title: 'Event agreements', copy: 'The paperwork behind a well-run event.',
      items: ['Vendor and supplier contracts', 'Participant waivers and releases', 'Venue agreements', 'Photo and video consent'] },
    { n: '05', title: 'Other related matters', copy: 'The everyday legal questions that come with media, marketing, and partnerships.',
      items: ['IP and trademark basics', 'Non-disclosure agreements (NDAs)', 'Contract review before you sign', 'Independent contractor agreements'] },
  ],
  steps: [
    { n: '01', t: 'Inquiry', d: 'Tell us briefly what you need. Keep it general; no confidential details yet.' },
    { n: '02', t: 'Introduction', d: 'If it\'s a fit, we introduce you to our independent counsel.' },
    { n: '03', t: 'Consultation', d: 'You speak with the attorney directly and agree scope and fees with them.' },
    { n: '04', t: 'Engagement', d: 'You engage the attorney directly. We keep the campaign moving alongside.' },
  ],
};

// Featured Instagram accounts on /creators ("Our network"). Images live in public/images/creators/<handle>/.
// Grid images: { src, alt, wide } (wide = spans 2 columns). Follower counts are deliberately not shown.
const creatorAccounts = [
  {
    handle: 'travelers.content', name: 'Travelers Content', url: 'https://www.instagram.com/travelers.content/',
    tag: 'Underwater · Wildlife · Macro',
    desc: 'St. Pete–based underwater, wildlife, macro, and nature photography, shot on Sony α1 / α7 IV.',
    avatar: '/images/creators/travelers.content/avatar.webp', avatarRound: false,
    images: [
      { src: '/images/creators/travelers.content/01.webp', alt: 'Freediver swimming with sea lions' },
      { src: '/images/creators/travelers.content/02.webp', alt: 'Diver above a shark in deep blue water' },
      { src: '/images/creators/travelers.content/03.webp', alt: 'Sandbar shark from below, Jupiter, Florida' },
      { src: '/images/creators/travelers.content/05.webp', alt: 'Devil rays gliding through open water' },
    ],
  },
  {
    handle: 'stpetersburgphotography', name: 'St Petersburg Photography', url: 'https://www.instagram.com/stpetersburgphotography/',
    tag: 'Photo · Drone · Shoots',
    desc: 'St. Pete photography and drone work (Sony α1 / α7 IV, DJI Mini 4 Pro), available to schedule a shoot.',
    avatar: '/images/creators/stpetersburgphotography/avatar.webp', avatarRound: true,
    images: [
      { src: '/images/about/matt-camera.webp', alt: 'Matt Morrow shooting with a Sony camera', wide: true, pos: 'top' },
      { src: '/images/listings/sea-horse/01.webp', alt: 'Drone aerial over a St. Pete lake with the downtown skyline', wide: true },
    ],
  },
  {
    handle: 'stpetemarathon', name: 'St. Pete Marathon™', url: 'https://www.instagram.com/stpetemarathon/',
    tag: 'Running · Events · Waterfront',
    desc: 'The inaugural St. Pete Marathon, home of the 2027 USATF Florida Marathon Championships, December 2027 in St. Petersburg.',
    avatar: '/images/creators/stpetemarathon/avatar.webp', avatarRound: true,
    images: [
      { src: '/images/creators/stpetemarathon/03.webp', alt: 'Sailboat masts at a St. Pete marina at sunset' },
      { src: '/images/creators/stpetemarathon/02.webp', alt: 'Waterfront park with oak trees in St. Pete' },
      { src: '/images/creators/stpetemarathon/06.webp', alt: 'The pink Vinoy hotel framed by palm trees' },
      { src: '/images/creators/stpetemarathon/05.webp', alt: 'The Dalí Museum with palm trees' },
    ],
  },
];

module.exports = { creatorAccounts, images, pillars, steps, webServices, realEstate, sponsorshipServices, creatorOpportunities, showcase, legal, packages, revenueModel };

// ── Featured real estate listings — REAL photos shot by Matt (see README).
// Files: /public/images/listings/<slug>/<NN>.webp (≤1600px) + <NN>-thumb.webp (640px). Originals in data-src/raw.
const L = (slug) => (n, alt) => ({ full: `/images/listings/${slug}/${n}.webp`, thumb: `/images/listings/${slug}/${n}-thumb.webp`, alt });
const tr = L('trillium');
const sh = L('sea-horse');
const cw = L('circlewood');
const listings = [
  {
    slug: 'trillium',
    address: '8345 Trillium Rd, Fort Myers',
    facts: 'Two-story single-family home · 3 bed · 3 bath · 1,431 sq ft',
    caption: 'A bright, elevated two-story home photographed for listing: clean exteriors, an aerial for neighborhood context, and interiors that let the open kitchen and natural light lead.',
    services: ['MLS photography', 'Exterior photography', 'Interior photography', 'Aerial photography'],
    lead: tr('30', 'Front exterior of a two-story home with double garage and elevated porch'),
    gallery: [
      tr('29', 'Aerial view over the Fort Myers neighborhood'),
      tr('01', 'Street-facing exterior with driveway'),
      tr('02', 'Open-plan living room and kitchen'),
      tr('03', 'Kitchen island with granite counters and white cabinetry'),
      tr('06', 'Living area opening to the deck'),
      tr('08', 'Elevated deck with tree-line views'),
      tr('09', 'Bedroom with ceiling fan and twin windows'),
      tr('11', 'Double vanity bathroom with walk-in closet'),
      tr('16', 'Bathroom with mosaic tile backsplash'),
      tr('20', 'Second kitchen on the lower level'),
    ],
  },
  {
    slug: 'sea-horse',
    address: '123 Sea Horse Dr, St. Petersburg',
    facts: 'Condo · 2 bed · 2 bath',
    caption: 'A lakefront condo where the setting sells: an aerial that frames the lake and downtown skyline, the screened balcony view, the community amenities, and the renovated interiors.',
    services: ['MLS photography', 'Aerial photography', 'Interior photography', 'Amenity & lifestyle photography'],
    lead: sh('01', 'Aerial view of the lakefront condo community with the downtown St. Petersburg skyline'),
    gallery: [
      sh('14', 'Screened balcony overlooking the lake'),
      sh('18', 'Lakefront green space and reflections'),
      sh('15', 'Exterior staircase and building facade'),
      sh('16', 'Community pool'),
      sh('04', 'Living room with French doors to the balcony'),
      sh('03', 'Kitchen opening to the living area'),
      sh('02', 'Kitchen with stainless appliances'),
      sh('12', 'Renovated walk-in shower with matte black fixtures'),
      sh('17', 'Community clubhouse lounge'),
      sh('19', 'Clubhouse billiards room'),
    ],
  },
  {
    slug: 'circlewood',
    address: '456 Circlewood Dr, Venice',
    facts: 'Condo · 2 bed · 2 bath · 1,208 sq ft',
    caption: 'A bright Venice condo under Gulf Coast blue sky: a palm-framed cover shot, sunlit exteriors, and airy interiors from the white kitchen to the bedrooms, finished with a tropical detail.',
    services: ['MLS photography', 'Exterior photography', 'Interior photography', 'Detail & lifestyle photography'],
    lead: cw('01', 'White single-story home with twin palms and a carport under a blue sky'), // Matt's chosen cover
    gallery: [
      cw('21', 'Sunny side exterior with shuttered windows and stone border'),
      cw('05', 'Dining area opening to the kitchen'),
      cw('03', 'White kitchen with granite counters'),
      cw('06', 'Living room with ceiling fan and wood-look floors'),
      cw('07', 'Open living and dining space'),
      cw('14', 'Bedroom with four-poster bed'),
      cw('13', 'Bedroom with ceiling fan and dresser'),
      cw('15', 'Bathroom vanity with linen closet'),
      cw('12', 'Bathroom with dark vanity and striped shower curtain'),
      cw('22', 'Red hibiscus in bloom against a blue sky'),
    ],
  },
];
module.exports.listings = listings;

// ── Founder — facts from Matt's public LinkedIn + what he's told us. Don't add clients, numbers or awards.
module.exports.founder = {
  name: 'Matt Morrow',
  role: 'Founder',
};

// About page copy — Matt's words (Nov 1, 2026). Edit here; src/pages.js about() only lays it out.
module.exports.about = {
  headline: ['The agent.', 'The creator.', 'The developer.'],
  lede: 'One founder who has worked across real estate, media, marketing, content creation, and software development—and now brings brands, creators, organizations, and events together.',
  story: [
    'Morrow Media is a creative agency based in St. Petersburg, Florida, founded by Matt Morrow. Matt brings an unusual combination of experience to the agency: he understands the business side of marketing, the creative side of content, and the technical side of building and measuring digital products.',
    'Matt\u2019s background began in real estate, where he learned firsthand how much the quality of a property\u2019s marketing can influence how it is perceived. Through his work with RMS Elite Properties and his National Association of REALTORS® membership, he developed a strong understanding of branding, visual marketing, and the importance of presenting a property or business correctly online.',
    'He\u2019s also a photographer and videographer who has spent years building a substantial body of work across travel, outdoor, lifestyle, events, real estate, and commercial projects. Photography and video aren\u2019t simply services he outsources—he is the person behind the camera creating the content.',
    'Matt is also the creator behind Travelers Content, a travel-focused brand spanning social media, YouTube, and other digital platforms. Building Travelers Content has provided firsthand experience with what it takes to grow a social audience, develop a recognizable brand, create content consistently, and work with organizations and creators.',
    'That experience led to a broader interest in the relationship between brands, creators, organizations, and sponsors.',
  ],
  quote: 'A successful partnership isn\u2019t just putting a logo on an event or paying an influencer to make a post. It\u2019s about finding the right audience, the right creator, the right story, and the right brand—and creating something that provides real value to everyone involved.',
  founder: [
    'Matt brings the developer side of his background into that process as well. With more than four years of professional software development experience, he understands data, systems, automation, digital products, and how to measure what is actually working. That technical perspective helps Morrow Media approach marketing with more than just aesthetics.',
    'He\u2019s also a licensed real estate professional and photographer, allowing the agency to produce much of its visual content in-house.',
  ],
  doesTitle: 'What Morrow Media does',
  does: [
    ['CONTENT', 'Photography, videography, drone, social media content, short-form video, and visual storytelling.'],
    ['SOCIAL BRANDS', 'Helping organizations and businesses develop a recognizable presence and build an audience that actually cares about what they do.'],
    ['CREATOR PARTNERSHIPS', 'Connecting organizations with photographers, videographers, influencers, and creators who can authentically reach the audiences they want.'],
    ['SPONSORSHIPS', 'Helping events and organizations identify potential sponsors and develop partnerships that make sense for both sides.'],
    ['MARKETING', 'Building campaigns and content strategies around a clear goal—not simply creating content for the sake of posting.'],
    ['REAL ESTATE & COMMERCIAL MEDIA', 'Professional photography, video, and aerial content designed to market properties, businesses, destinations, and experiences.'],
  ],
  closing: [
    'Morrow Media exists at the intersection of media, marketing, technology, and relationships.',
    'We create the media. Build the campaigns. Connect the people. And help turn attention into something valuable.',
  ],
};
