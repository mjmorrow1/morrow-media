// ─────────────────────────────────────────────────────────────
//  SITE CONFIG — change the brand name and contact details here.
//  Every page, title, footer and the admin pull from this file.
// ─────────────────────────────────────────────────────────────
module.exports = {
  brand: 'SouthBridge Media',
  brandShort: 'SouthBridge',      // used in the compact logo mark
  // Public canonical origin. The previous hostname still serves this Worker.
  // Do not redirect the old apex here; that cutover is a separate routing step.
  canonicalHost: 'sbridgemedia.com',
  legacyHost: 'morrowmediagroup.com',
  // Stable host for calendar UIDs, the Authentisign webhook, and mailbox fallbacks.
  // These stay on the existing domain until those registrations are changed.
  serviceHost: 'morrowmediagroup.com',
  tagline: 'Creative media. Strategic marketing. Meaningful partnerships.',
  oneLiner: 'We create the content, build the campaigns, and connect brands, creators, and events.',
  positioning: 'We create the media, build the campaigns, and connect the people behind them.',
  location: 'St. Petersburg, Florida',
  region: 'Tampa Bay & the Gulf Coast',
  // Page switches. Set a page to true to show it again (nav, footer, links, and route).
  // marketing: hidden for now — /marketing 302-redirects to /media while false.
  pages: { marketing: false },
  email: 'sponsors@morrowmediagroup.com',
  phone: '(908) 343-5744',          // shown on /contact and in the footer; leave '' to hide
  phoneTel: '+19083435744',
  social: {
    instagram: 'https://instagram.com/travelers.content', // swap for the agency handle when created
    youtube: '',
    tiktok: '',
  },
  // ── Legal page (/legal). Legal services are provided by an INDEPENDENT attorney at law, not by this website's public brand.
  //    PLACEHOLDERS: leave '' until Matt confirms the details with the attorney. Empty fields render nothing.
  legal: {
    attorneyName: '',   // e.g. 'Jane Doe, Esq.'  (shown as "Independent counsel: …" only when filled)
    firmName: '',       // the attorney's own practice name, if any
    bar: '',            // bar admission / number, e.g. 'Florida Bar No. 0000000' (shown only when filled)
    website: '',        // the attorney's own site, if any
  },
  year: new Date().getFullYear(),
  // Server
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1', // localhost only by default
};
