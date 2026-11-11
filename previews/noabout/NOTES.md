# Remove About page + hide `.pages.dev` featured-site labels (preview pack)

Preview only until the owner approves a publish. Do **not** apply `/workspace/about-preview/` (unpublished About rewrite). Do **not** full-rebuild from GitHub `main` onto production — `main` is behind the live Worker (`5ad8d7ad-3330-43c9-b547-2e08fcf94be7`, collage stamp `mw9ccfeat1`). Use this surgical pack.

Built on live HTML as of the pack baselines in `baseline/` / `HASHES.json`. CSS (`/css/site.css`) is unchanged; do not bump `?v=` stamps (`mw9logo3b` on most pages, `mw9ccfeat1` on creators/credits).

## What changes

1. **About page removed from the site chrome.** The About link is gone from the header nav, mobile menu, and footer Company column on every public HTML page in KV. There was no sitemap. In-page prose such as “Talk about your event” is unchanged. `/images/about/` image paths are unchanged.
2. **`/about`, `/about/`, and `/about.html` 301 to `/`.** The Worker already strips a trailing slash before `REDIRECTS_301`, so adding `'/about':'/'` covers `/about` and `/about/`. `'/about.html':'/'` is explicit. KV still holds `/_pages/about.html` (backed up first); the redirect runs before `PAGES`, so the file is not served.
3. **Featured-site cards stay.** Tango Two One and Neurons Away keep their names, images, descriptions, “Visit new site” / “Old site” links, and tile hrefs to `https://tangotwoone.pages.dev/` and `https://neuronsaway.pages.dev/`. Only the **visible / announced labels** change:
   - `<strong>After — tangotwoone.pages.dev</strong>` → `<strong>After</strong>`
   - `<strong>After — neuronsaway.pages.dev</strong>` → `<strong>After</strong>`
   - matching `aria-label="After — *.pages.dev"` → `aria-label="After"`
   - “Before — tangotwoone.com” / “Before — neuronsaway.com” stay (not `.dev`).
   This is only on home and `/media`.

Collage, pricing, and admin are not touched. Unmerged PRs (user-management, invoicing, etc.) are not included.

## Local preview

```
python3 /workspace/noabout-preview/preview-server.py 8798
```

Serves patched HTML from `pages/`, 301s `/about`, `/about/`, and `/about.html` to `/`, and proxies other assets from `https://sbridgemedia.com`. Verified: no About nav link; featured cards remain without visible `.pages.dev` labels; collage handles still present on `/creators`.

## Screenshots

Under `/workspace/noabout-preview/screenshots/`:

| Shot | Before (live) | After (local preview) |
| --- | --- | --- |
| Header nav | `before-home-header.png` | `after-home-header.png` |
| Footer columns | `before-home-footer-cols.png` | `after-home-footer-cols.png` |
| Footer Company column | `before-home-footer-company.png` | `after-home-footer-company.png` |
| Mobile menu | `before-home-mobile-menu.png` | `after-home-mobile-menu.png` |
| Featured: Tango Two One (home) | `before-home-featured-tango.png` | `after-home-featured-tango.png` |
| Featured: Neurons Away (home) | `before-home-featured-neurons.png` | `after-home-featured-neurons.png` |
| Featured: Tango Two One (`/media`) | `before-media-featured-tango.png` | `after-media-featured-tango.png` |
| Featured: Neurons Away (`/media`) | `before-media-featured-neurons.png` | `after-media-featured-neurons.png` |
| Listing copy (name + description; unchanged) | `before-home-listing-*-info.png` | `after-home-listing-*-info.png` |

## Publish (when approved)

Do not read or reset Worker secrets. `keep_bindings: ['secret_text']`.

1. Cloudflare execute `00-hash-check.js` (read-only). Abort if any live KV hash drifted from `baseline/HASHES.json`.
2. Execute `02-pages.js`. Backs up each key to `/_backups/noabout-*`, then writes the patched HTML. Does not write CSS.
3. Execute `03-worker-redirects.js`. Refuses unless the live Worker version is `5ad8d7ad-3330-43c9-b547-2e08fcf94be7` and the module still contains `notifyFormAlert`, `logo-lockup`, and `mw9ccfeat1`. Adds `"/about":"/"` and `"/about.html":"/"` to `REDIRECTS_301` only. Does **not** bump `META.VERSION` or CSS `?v=` stamps. Refuses if invoicing code is already in the Worker.
4. Purge **only** the URLs in `PURGE-URLS.txt` on both `sbridgemedia.com` (zone `586cb9bfd626f2b72c3c27520d8c1038`) and `morrowmediagroup.com` (zone `3e0ec9bae92caee26dc3de7117790ba4`). Never a zone-wide purge. Do not purge `/css/site.css`.
5. Verify: `/about`, `/about/`, `/about.html` are 301 to `/`; nav has no About; featured cards remain, without visible `.pages.dev` labels; collage and admin login still work.

Rollback: execute `90-rollback.js` to restore the KV backups and return traffic to Worker version `5ad8d7ad-3330-43c9-b547-2e08fcf94be7`.

## Pages written by `02-pages.js`

`/_pages/home.html`, `media.html`, `creators.html`, `sponsorships.html`, `legal.html`, `about.html` (content left in KV; redirect wins), `brands.html`, `services.html`, `contact.html`, `credits.html`, `thanks.html`, `contact-creator.html`, `contact-event.html`, `sponsorships-founding-partner.html`, `sponsorships-inner-circle.html`, `sponsorships-stakeholder.html`, `404.html`.
