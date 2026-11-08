# Morrow Media — rough-draft website + local CRM

Agency site for **Morrow Media** (St. Petersburg, FL): *Creative media. Strategic marketing. Meaningful partnerships.*
Four pillars up front — **MEDIA | MARKETING | CREATORS | SPONSORSHIPS** — with every service listed underneath.

## Run it

```bash
cd /workspace/morrow-media
npm install            # first time only
./scripts/start.sh     # background server → http://localhost:3000   (logs in logs/server.log)
./scripts/stop.sh      # stop it
npm start              # or run in the foreground
PORT=4000 ./scripts/start.sh   # different port
```

Checks: `node scripts/smoke.js` (every page 200 + each form saves a row, then cleans up),
`node scripts/ui-test.js` (real browser fills and submits every form),
`node scripts/screenshots.js` (full-page PNGs → `screenshots/`).

## Stack

Node 20 + Express 4, server-rendered HTML (no build step), vanilla CSS/JS, SQLite via better-sqlite3 (`data/crm.sqlite`).
Fonts (Inter + Cormorant Garamond) are self-hosted in `public/fonts`. Headless Chrome + playwright-core for screenshots.

## Change the brand name / contact info

Everything comes from **`src/config.js`**: brand name, tagline, location, email, social links, port.
The public contact email is `sponsors@morrowmediagroup.com` (set in `src/config.js`, `email`).

## Pages

| Route | Page |
|---|---|
| `/` | Home: full-screen hero (real St. Pete photo, credited), **Current campaign** teaser strip (St. Pete Marathon), 4 pillar cards, How It Works (Discover/Create/Connect/Amplify), selected work, 3 entry points, pricing statement |
| `/services` | All four pillars with their full service lists |
| `/media` | Media & Creative + **Real Estate Media** vertical (`/media#real-estate`), with the FAA Part 107 mention, followed by **Featured listings** (`#featured-listings`): two real case studies with lightbox galleries |
| `/marketing` | **Hidden for now** (`pages.marketing: false` in `src/config.js`): 302 → `/media`. The page (Strategy / Content / Distribution / Partnerships) is still in `src/pages.js` → `marketing()` |
| `/creators` | Creator Network: "Creators wanted." + JOIN THE CREATOR NETWORK, which opens the application |
| `/brands` | "Need people to see your brand?": CREATE / CONNECT / ACTIVATE → START A CAMPAIGN |
| `/sponsorships` | Events & Sponsorships: featured client campaign **St. Pete Marathon (Inaugural)** (`#st-pete-marathon`: hero, pitch, facts, 3 tier cards), sponsor inquiry form (`#sponsor-inquiry`, `?tier=founding-partner|inner-circle|stakeholder` preselects), then "Turn your audience into opportunity." → TALK ABOUT YOUR EVENT |
| `/legal` | Legal: services from an **independent attorney at law** (LLC formation & structure, sponsorship/partnership contracts, creator & talent agreements, event agreements, other matters), how it works, consultation form (`#consultation`), prominent disclaimer. See "Legal page" below |
| `/about` | About: Matt's own copy (headline, lede, story, pull quote, founder block, "What Morrow Media does" six-item grid, closing statement), text in `about` in `src/content.js` |
| `/credits` | Photo credits / licenses for the stock photos (linked from the footer and from each photo's credit line) |
| `/contact` | Three entry points with their own forms: I'm a Brand / I'm a Creator / I'm an Event Organizer (`?type=brand|creator|event`) |

Aliases: `/creator-network`, `/events`, `/real-estate`, `/legal-services`.

**Hidden pages (`pages` in `src/config.js`).** `pages: { marketing: false }` hides the Marketing page: it comes out of the top nav, the mobile menu and the footer, `/marketing` returns a **302** (temporary) to `/media`, and the Marketing pillar card on Home and Services links to `/contact?type=brand` ("Start a campaign") instead. To bring the page back, set `marketing: true` and restart the server. Nothing else needs to change.

**The Work page (`/portfolio`) was removed.** `/portfolio` and `/work` now 301-redirect to `/media` (real work lives in the Featured listings there). The "View our work" buttons on Home point to `/media`, and the portfolio grid data, template, CSS, and filter JS were deleted.

The live site's `/admin` also has a contacts CRM, a follow-up calendar with an iPhone/Google calendar feed, and an Authentisign signings log, plus Jira-style tickets (board, list, comments, subtasks) and a KPIs page with goals (see DEPLOY.md). The same login protects `/admin/setup`, a read-only setup guide. To run that version locally, use `node scripts/worker-dev.js`.

## CRM / admin (local, login required)

`/admin` needs a login (same email and password as the live site; the hash is in git-ignored `.env.admin`, see DEPLOY.md). It also only answers requests from 127.0.0.1, and the server binds to 127.0.0.1 by default.
**Add real auth before putting this on the internet.**

- Tables: **Creators, Brands, Events, Campaigns, Sponsors** (schema in `src/db.js`, which drives both the DB and the admin UI).
- Website forms write to: Brand form → `brands`, Creator application → `creators`, Event form → `events`, St. Pete Marathon sponsor form → `sponsors` (with `campaign`, `tier`, `notes`, status `Prospect`).
- Campaigns are internal and get added from the admin (plus the seeded St. Pete Marathon campaign, below). Sponsors come from the admin or the sponsor form. Every table supports add, status change, delete, and CSV export (`/admin/<table>.csv`).
- `/admin/packages` holds the **internal standard packages** (Content Session, Social Content, Real Estate Media, Event Media, Creator Campaign, Sponsorship Campaign) and the revenue model. These are never shown on the public site. Edit them in `src/content.js`. Prices are TBD.

## Real listing photos (Matt's real estate work)

The real estate imagery is **real**: listing photos from three of Matt's shoots, which replaced the AI real estate placeholders.

- Site files: `public/images/listings/<slug>/NN.webp` (long edge up to 1600px, quality 80) and `NN-thumb.webp` (640px, used in grids).
- Originals: all downloaded photos (35 Trillium + 20 Sea Horse + 23 Circlewood) are in `data-src/raw/{trillium,sea-horse,circlewood}/` (source list in `data-src/listings.txt`). They're kept out of `public/` so the site stays light.
- Selections, captions, alt text, and facts: the `listings` array in `src/content.js`. Add another property by adding an entry there.
- Used on: `/media#featured-listings` (case studies plus lightbox), the St Petersburg Photography card on `/creators` (Sea Horse 01), and the Home "Real Estate" showcase card (Sea Horse aerial).

| Listing | Facts shown | Lead | Gallery |
|---|---|---|---|
| 8345 Trillium Rd, Fort Myers (shown first) | Two-story single-family · 3 bed · 3 bath · 1,431 sq ft | 30 front exterior | 29 aerial, 01, 02, 03, 06, 08, 09, 11, 16, 20 |
| 123 Sea Horse Dr, St. Petersburg (shown second) | Condo · 2 bed · 2 bath | 01 aerial with downtown skyline | 14, 18, 15, 16, 04, 03, 02, 12, 17, 19 |
| 456 Circlewood Dr, Venice (shown third) | Condo · 2 bed · 2 bath · 1,208 sq ft | 01 white home with palms, Matt's chosen cover (exposure-edited, see below) | 21 side exterior, 05, 03, 06, 07, 14, 13, 15, 12, 22 hibiscus |

Notes:
- The site intentionally shows **no prices, listing status, or Zillow links**, and only street + city.
- The Trillium photos carry a small **"SWFLAMLS"** MLS watermark in the bottom-left corner. Swap in the unwatermarked originals from Matt's files if possible. The Trillium sources also max out at 1024px wide, so Matt's originals would look sharper.
- Circlewood: skipped utility and filler shots (water heater/laundry 19, AC 23, closets 11 and 17, toilet 16, empty rooms 08–10). Sources are 1024px wide (portraits 512px). No aerials, so it isn't tagged aerial.
- **Circlewood cover exposure edit:** `01.webp` / `01-thumb.webp` are rendered from `data-src/raw/circlewood/01-exposure-0.3ev.jpg`, an edit of the untouched original `01.jpg` that is about -0.3 EV. The gain is applied in linear light with the same factor on R, G, and B, so the color doesn't shift. Shadows get only about 45% of the reduction so they aren't crushed, and a soft shoulder pulls in the highlights. The source had about 24% clipped pixels (sky and white walls); the edit brings that to 0%, though detail that was already blown can't be recovered. Before/after: `screenshots/circlewood-cover-before-after.jpg`. A higher-res, unclipped original from Matt would be better.
- Sea Horse pool, clubhouse, and green space are **community amenities**, not part of the unit.
- Confirm Matt holds the rights to use these images in agency marketing. Agents and brokerages sometimes hold licenses.
- The old AI real estate placeholders (`pf-realestate-twilight.jpg`, `pf-realestate-interior.jpg`, `pf-drone-realestate.jpg`) are no longer used. They were moved to `data-src/unused-placeholders/`.

## Real photos of Matt (About page)

- `public/images/about/matt-camera.webp` (1200×1600) is the lead About image. Source: `data-src/about/matt-camera.jpg`.
- `public/images/about/matt-portrait.webp` (590×587) is the headshot, with the phone screenshot's black bars cropped out (`data-src/about/matt-portrait-cropped.png`). It's used in the About "Founder" block and the small founder strip on Home. The source is low resolution, so a higher-res headshot would sharpen it.
- The old `about-drone.jpg` placeholder moved to `data-src/unused-placeholders/`.

## Real St. Petersburg photos (licensed stock, attribution required)

The AI home hero (`hero-st-pete-waterfront.jpg`, now in `data-src/unused-placeholders/`) was replaced with real photos of **St. Petersburg, Florida** (not St. Petersburg, Russia; both are verified against the Commons file descriptions and categories, and the visible landmarks match downtown St. Pete). Full details: **`CREDITS.md`** and the `/credits` page, which is linked from the footer and from a small credit line on each photo.

| Site file | Used on | Source | Author | License |
|---|---|---|---|---|
| `public/images/stpete/hero-demens-landing-sunset.webp` (2400w) + `-1280.webp` | Home hero | [Wikimedia Commons: Sitting by the dock on the bay. (28240365509).jpg](https://commons.wikimedia.org/wiki/File:Sitting_by_the_dock_on_the_bay._(28240365509).jpg). Downtown St. Pete from Demens Landing Park at sunset | Gregory Urbano | CC BY 2.0 |
| `public/images/stpete/skyline-sunrise.webp` (2400w) + `-1280.webp` | St. Pete Marathon campaign hero (`/sponsorships`) | [Wikimedia Commons: St. Petersburg Florida skyline at sunrise 1.jpg](https://commons.wikimedia.org/wiki/File:St._Petersburg_Florida_skyline_at_sunrise_1.jpg) | Andrew Heneen | CC BY 4.0 |

- Changes: resized/cropped and converted to WebP. The home hero gets a darker overlay (`.hero-shade`) so the white headline stays readable. Originals and metadata are in `data-src/stock/` (`credits.json`).
- CC BY requires credit with the author, license, and a link. Keep the credit lines and the `/credits` page if you swap the layout.
- The other Home images (pillar cards, Events/Brands showcase) are people and event scenes, not St. Pete scenery, so they're still AI placeholders (listed below). `pf-event-regatta.jpg` (sailboats in front of an AI-made St. Pete-style skyline) is no longer used anywhere and sits in `data-src/unused-placeholders/`.

## Featured client campaign: St. Pete Marathon (Inaugural)

- **One config file:** `src/campaigns/st-pete-marathon.json` contains all event data, the pitch, facts, and tiers, plus these flags:
  - `enabled` (false hides the campaign block and the Home teaser)
  - `showPricing` (default **true**; false replaces the prices with "Pricing on request" on the cards and in the form's tier select)
  The file is read on every request through `src/campaign.js`, so edits show up without a restart.
- **Confidentiality:** the client's partner page (https://partners.stpetemarathon.com) is marked **"CONFIDENTIAL: FOR INAUGURAL PARTNER REVIEW ONLY"**. Confirm with the client that the tier pricing can be public. If not, set `showPricing: false`. For the same reason, the partner page's pricing graphic (`data-src/campaigns/st-pete-marathon/card.jpg`) is saved for reference only and **is not displayed**.
- **Facts used and where they came from:**
  - From stpetemarathon.com: December 2027 is the inaugural running. It's St. Pete's inaugural December marathon, on a fast, flat, waterfront course. Start and finish are at Flora Wylie Park (1400 N Shore Dr NE, Historic Old Northeast), and the course stays entirely in St. Petersburg. It's home of the 2027 USATF Florida Association Marathon Open & Masters Championships. Race day has a 6 AM start and a 6-hour limit. St. Pete Run Club is the official training club. The event is produced by St. Petersburg Marathon LLC.
  - From partners.stpetemarathon.com: the three tiers and their benefits, and "Partnerships processed via St. Petersburg Marathon LLC."
  - The partner page's payment links are **not** used anywhere on the site. Sponsors go through our inquiry form.
- **Tiers:**
  - Founding Partner $5K (highlighted, "Lifetime distinction")
  - Inner Circle $2K
  - Stakeholder $1K
  - Each card has a "Become a [Tier] Sponsor" CTA that preselects the tier in the form, scrolls to it, and updates the URL.
- **Form → CRM:** `/sponsorships#sponsor-inquiry` posts to `sponsors`.
  - Fields: company, contact_name, email, phone, industry, tier, budget, notes.
  - The server sets `campaign = "St. Pete Marathon"` (it ignores any value sent by the client), checks the tier against the configured tiers, and sets `status = Prospect` and `source = "website · St. Pete Marathon sponsor form"`.
- **Seeded campaign:** on startup, `src/db.js` makes sure the `campaigns` table has *St. Pete Marathon (Inaugural) Sponsorships*:
  - client St. Pete Marathon
  - type Sponsorship Campaign
  - status Active
  - tiers in deliverables/budget
  It's only inserted if missing, so it's idempotent.
- **Existing databases (laptop):** startup runs `CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE … ADD COLUMN` for any missing column. That adds `campaigns.type` and `sponsors.campaign/tier/notes` without touching existing rows, then seeds the campaign. This was tested against an mm4-era database with an existing row.
- The client logo (`public/images/campaigns/st-pete-marathon/logo.webp`) comes from the client's own public site. Confirm they approve this use.

## Legal page (`/legal`): independent attorney

- Legal services are provided by an **independent attorney at law who is not an employee of Morrow Media**. Morrow Media is not a law firm and gives no legal advice; using the site or the form creates no attorney-client relationship, and engagements are made directly with the attorney. The page carries a notice block under the hero, a one-line version next to the form, and a full disclaimer at the bottom. **Keep them.**
- Copy (practice areas, how-it-works steps) lives in `legal` in `src/content.js`. No attorney names, bar numbers, credentials, prices, or outcomes are claimed anywhere.
- **Placeholders to fill in:** `legal` in `src/config.js` has `attorneyName`, `firmName`, `bar`, and `website`. All are empty, and while they're empty nothing renders. Once filled, an "Independent counsel: …" line appears under the notice.
- **Inquiries:** the consultation form posts to `/api/submit/legal` and lands in the **Brands** table with `interests = "Legal / contracts · <matter>"`, `goals = details`, `source = "website · legal inquiry"` (company defaults to "Individual"). The Brand form on `/contact` also has a "Legal / contracts" interest chip.
- Have the attorney review this page before launch. Lawyer advertising and referral arrangements are regulated by the state bar (in Florida, the Rules Regulating The Florida Bar, ch. 4-7 and 4-5), including the "hiring of a lawyer" statement and any referral fees.

## ⚠️ Placeholder images (swap for Matt's own work)

Every image in `public/images/placeholders/` (everything except `public/images/listings/`) is an **AI-generated placeholder**. None of it is real client work or stock, and all of it should be replaced before launch.
Swap a file in place under the same name, or change the paths in `src/content.js`.

| File | Used for |
|---|---|
| `card-media.jpg` | Media card + Media page hero |
| `card-marketing.jpg` | Marketing card + Marketing page hero |
| `card-creators.jpg` | Creator Partnerships card, Creator Network hero, Brands "Connect" |
| `card-sponsorships.jpg` | Sponsorships card, Sponsorships hero |
| `pf-restaurant.jpg` | Home showcase (Brands) |
| `pf-product.jpg` | Brands "Create" |
| `pf-event-gala.jpg` | Home showcase (Events), Brands "Activate" |

No longer used since the Work page was removed (moved to `data-src/unused-placeholders/`): `pf-drone-beach.jpg`, `pf-drone-resort.jpg`, `pf-event-regatta.jpg`, `pf-social-boat.jpg`, `pf-video-auto.jpg`.

## Draft copy to confirm

- The About page text is Matt's own copy (Nov 1, 2026), in `about` in `src/content.js`. One fix was made: "his National Association of REALTORS® membership" (the word "membership" was missing). The old bio, the draft founder quote and the credentials list were removed. His copy says "licensed real estate professional"; an earlier public-records check showed his FL license as expired, so confirm it's active before launch.
- "FAA Part 107 certified" appears on Media, About, the footer and the Real Estate package. Confirm the certification is current.
- The Instagram link points to @travelers.content until an agency handle exists.
