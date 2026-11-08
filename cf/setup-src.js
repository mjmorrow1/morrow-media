// Admin setup guide (/admin/setup). Inlined by scripts/build-cf.js. Read-only.
// Update a status only after a new check, and describe the evidence in the status text.
// Never put secret values, password hashes, private calendar feed URLs, customer records, or machine-local paths in this file.
const SETUP_CSS = `.setup-banner{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:0 0 16px}.setup-banner p{margin:8px 0 0}.setup-jump{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 8px}.setup-jump a{text-decoration:none;font:500 12px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;padding:10px 14px;border-radius:999px;border:1px solid var(--line);background:#fff}.setup-sec{margin:28px 0 8px;scroll-margin-top:12px}.setup-sec p{color:var(--muted);margin:6px 0 12px}.setup-steps{list-style:none;margin:0;padding:0;display:grid;gap:12px}.setup-steps>li{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;min-width:0;scroll-margin-top:12px}.setup-steps h3{margin:0 0 10px;font:600 clamp(16px,2.4vw,18px)/1.35 var(--sans);letter-spacing:-.02em}.step-no{color:var(--muted);font-variant-numeric:tabular-nums;margin-right:8px}.setup-statuses{list-style:none;margin:0 0 4px;padding:0;display:grid;gap:6px}.setup-statuses li{display:flex;gap:8px;align-items:flex-start;min-width:0}.setup-statuses .badge{flex:none;margin-top:1px}.step-k{margin:12px 0 2px}.setup-steps p{margin:0;overflow-wrap:anywhere}.setup-refs{display:flex;gap:8px 14px;flex-wrap:wrap;margin:12px 0 0;padding:0;list-style:none}.setup-refs a{overflow-wrap:anywhere}.badge.st-complete{background:#e6f2e8}.badge.st-verify{background:#efe9da}.badge.st-pending{background:#f3e6e6}.badge.st-optional{background:#e8eef7}
@media (min-width:1100px){.top nav a{letter-spacing:.08em;padding:10px 8px}}
@media (max-width:720px){.setup-banner,.setup-steps>li{padding:14px}.setup-jump a{padding:9px 12px;letter-spacing:.08em}.setup-statuses li{flex-direction:column;gap:4px}}`;

const SETUP_TONE = { complete: 'Complete', verify: 'Needs verification', pending: 'Pending', optional: 'Optional' };
const C = (c) => ({ c });

const SETUP_SECTIONS = [
  {
    id: 'core',
    title: 'Core setup — in order',
    intro: 'Do these for a working public site and a protected admin. Later items can stay unfinished only when the status says so.',
    steps: [
      {
        n: 1,
        title: 'Define the business, brand, and site content',
        task: ['Confirm the audience, services, brand name, logo, copy, calls to action, portfolio permissions, and contact destinations. Morrow Media source and public assets are in this repository. Owner approval of every current page is not recorded here.'],
        why: 'Clear positioning and approved content keep design and implementation focused.',
        needs: 'A business owner and an intended audience.',
        statuses: [{ tone: 'verify', text: 'Final content, image rights, and legal or privacy approval.' }],
        check: 'The owner reviews every public page on desktop and mobile. Links, claims, and contact details match what the business will stand behind.',
        refs: [{ label: 'README.md', href: 'https://github.com/mjmorrow1/morrow-media' }, { label: 'CREDITS.md', href: 'https://github.com/mjmorrow1/morrow-media' }],
      },
      {
        n: 2,
        title: 'Register and retain control of the domain',
        task: ['Register the domain in an account the owner controls. The live domain is morrowmediagroup.com. The registrar, renewal date, price, and auto-renew setting were not verified for this page.'],
        why: 'The domain is the durable public address. Losing renewal control can take down both the site and mail.',
        needs: 'An approved name, the account owner, and purchase approval.',
        statuses: [
          { tone: 'complete', text: 'The domain serves the site.' },
          { tone: 'verify', text: 'Registrar ownership, recovery contacts, auto-renew, and expiry.' },
        ],
        check: 'The owner confirms the registrar record and renewal settings. Keep proof in the registrar account, not on this page.',
        refs: [{ label: 'Live site', href: 'https://morrowmediagroup.com' }],
      },
      {
        n: 3,
        title: 'Create a private GitHub source repository',
        task: ['For future sites, create a private GitHub repository before routine changes and keep it as the source of truth. This project uses mjmorrow1/morrow-media. On November 8, 2026 Cursor cloned that repository and committed the sanitized site source. GitHub reported the repository as public that day. A git commit does not publish this page; the live Worker changes only when a script deploy keeps the existing secret bindings.'],
        why: 'Version history, review, and recovery should exist before day-to-day edits. A public repository is still not a place for credentials.',
        needs: 'A GitHub account, an empty private repository, and Cursor access to it.',
        statuses: [
          { tone: 'complete', text: 'Cursor can read this repository, and the sanitized source is committed in git.' },
          { tone: 'verify', text: 'Switch the repository to private if it is still public. Confirm a clean clone. This guide is not on the live Worker until that script deploy is done and checked while signed in.' },
        ],
        check: 'GitHub shows private visibility. The sanitized files are in a reviewed commit. A clean checkout installs and builds. Merge and deploy stay separate decisions.',
        refs: [{ label: 'Repository', href: 'https://github.com/mjmorrow1/morrow-media' }, { label: 'Secret names', href: 'https://github.com/mjmorrow1/morrow-media' }],
      },
      {
        n: 4,
        title: 'Establish secret hygiene and account security',
        task: ['Keep credentials out of Git, browser JavaScript, screenshots, and this page. Store them as Worker secrets. The import ignores environment files, local databases, logs, dependencies, generated bundles, and connector output. ', C('SECRETS.md'), ' lists names only.'],
        why: 'A private repository is not a secret store. A leaked key can expose admin data or create usage charges.',
        needs: 'Named account owners, recovery methods, and least-privilege access.',
        statuses: [
          { tone: 'complete', text: 'The imported package excludes local secret files, and Worker secret values were not copied into Git. Ignore rules cover .env, .env.*, .dev.vars, SQLite data, and generated deploy output.' },
          { tone: 'verify', text: 'MFA, account recovery, and the ongoing review of what gets committed. Public repository visibility makes this more urgent.' },
        ],
        check: 'Review ignore rules and the diff before every push. Scan each release. Never print a credential to prove that it works.',
        refs: [{ label: 'Cloudflare secrets', href: 'https://developers.cloudflare.com/workers/configuration/secrets/' }, { label: 'SECRETS.md', href: 'https://github.com/mjmorrow1/morrow-media' }],
      },
      {
        n: 5,
        title: 'Prepare the development and build workflow',
        task: ['Install dependencies from the lockfile, review ', C('package.json'), ', run the documented local workflow, and build Cloudflare artifacts with the existing scripts. Generated Worker files and rendered pages are rebuilt; they are not the source to edit.'],
        why: 'A repeatable build keeps the live site from depending on one machine or on undocumented edits.',
        needs: 'This repository, a supported Node environment, and the package lock.',
        statuses: [
          { tone: 'complete', text: 'On November 8, 2026 this environment ran npm ci, npm run build:cf, and node scripts/smoke.js successfully.' },
          { tone: 'verify', text: 'Those checks did not update the live Worker.' },
        ],
        check: 'A fresh environment installs, builds, and passes smoke tests without production credentials or customer data.',
        refs: [{ label: 'DEPLOY.md', href: 'https://github.com/mjmorrow1/morrow-media' }],
      },
      {
        n: 6,
        title: 'Set up Cloudflare ownership and DNS',
        task: ['Use the intended Cloudflare account, add the domain zone, and configure authoritative DNS. Connector access and the morrow-media Worker were verified before this import. Registrar nameserver delegation and the full zone record set were not rechecked for this page.'],
        why: 'DNS connects the domain to the website and to mail. A change has to preserve existing mail records.',
        needs: 'Control of the domain and access to the Cloudflare account.',
        statuses: [
          { tone: 'complete', text: 'The Cloudflare-hosted site responds.' },
          { tone: 'verify', text: 'Nameserver delegation, DNS ownership, and an exported record inventory.' },
        ],
        check: 'Confirm authoritative nameservers and the expected web and mail records before changing anything.',
        refs: [{ label: 'Cloudflare DNS', href: 'https://developers.cloudflare.com/dns/' }],
      },
      {
        n: 7,
        title: 'Provision the Worker, assets, and database',
        task: ['Deploy Worker ', C('morrow-media'), '. Store built pages and assets in KV ', C('morrow-media-site'), '. Apply additive schemas to D1 ', C('morrow-media-crm'), '. This site keeps the existing KV architecture.'],
        why: 'The Worker handles routes and server logic, KV holds the website files, and D1 stores application records.',
        needs: 'Build output and the Cloudflare account.',
        statuses: [
          { tone: 'complete', text: 'The live Worker and the KV and D1 binding types were verified. Resource names and schemas are documented.' },
          { tone: 'verify', text: 'A migration inventory and a restore test.' },
        ],
        check: 'Public pages and assets load. Database tables match the schema. Migrations do not erase existing data.',
        refs: [{ label: 'Workers', href: 'https://developers.cloudflare.com/workers/' }, { label: 'KV', href: 'https://developers.cloudflare.com/kv/' }, { label: 'D1', href: 'https://developers.cloudflare.com/d1/' }],
      },
      {
        n: 8,
        title: 'Attach bindings and deploy safely',
        task: ['Bind ', C('SITE'), ' to KV and ', C('DB'), ' to D1. Keep ', C('ADMIN_EMAIL'), ', ', C('ADMIN_PASS_HASH'), ', ', C('SESSION_SECRET'), ', and ', C('XAI_API_KEY'), ' as secret bindings. Deployment scripts are written to preserve secret bindings during uploads.'],
        why: 'Code cannot reach storage or authenticated services without the matching bindings. A redeploy must not erase secrets.',
        needs: 'The Worker, the storage resources, and secrets supplied through the secret store.',
        statuses: [{ tone: 'complete', text: 'Binding names and types were verified. Secret values were deliberately not retrieved, and presence alone does not prove a key works.' }],
        check: 'After any deploy, confirm the binding names and types, then run feature tests.',
        refs: [{ label: 'Bindings', href: 'https://developers.cloudflare.com/workers/runtime-apis/bindings/' }, { label: 'DEPLOY.md', href: 'https://github.com/mjmorrow1/morrow-media' }],
      },
      {
        n: 9,
        title: 'Connect the domain, HTTPS, and redirects',
        task: ['Attach the apex and www hostnames, turn on HTTPS, and use one canonical hostname. Docs state that www redirects to the apex, Always Use HTTPS is on, and legacy routes redirect to current pages.'],
        why: 'Visitors get a secure, consistent URL, and old links keep working.',
        needs: 'DNS and a deployed Worker.',
        statuses: [
          { tone: 'complete', text: 'The apex returned HTTP 200 in recent checks.' },
          { tone: 'verify', text: 'The full HTTP-to-HTTPS and www-to-apex matrix, certificate validity, and every documented legacy route.' },
        ],
        check: 'Test HTTP to HTTPS, www to apex, the certificate, a missing page, and the documented legacy redirects.',
        refs: [{ label: 'Live site', href: 'https://morrowmediagroup.com' }],
      },
      {
        n: 10,
        title: 'Secure the admin area',
        task: ['The admin uses a salted PBKDF2 password hash, a signed secure cookie, login throttling, same-origin checks on changes, output escaping, and no-store plus noindex headers. Passwords do not belong on this page.'],
        why: 'The admin exposes business records and controls that affect the live site.',
        needs: 'The admin secret bindings and the D1 schema.',
        statuses: [
          { tone: 'complete', text: 'Protected admin routes exist, and an unauthenticated AI status request returned 401.' },
          { tone: 'verify', text: 'A full authenticated security pass, including logout, throttling, and mobile login.' },
        ],
        check: 'Sign in and out. Signed-out requests fail. Cross-site writes fail. Rate limiting and mobile login work without revealing the password.',
        refs: [{ label: 'Admin sign-in', href: '/admin' }],
      },
      {
        n: 11,
        title: 'Test contact forms and CRM workflows',
        task: ['The app stores form submissions, contacts, follow-ups, signing logs, tickets, and KPI views in the admin. Those screens do not establish automated outbound email.'],
        why: 'A lead has to reach someone accountable. A form that only stores a row is not yet a finished workflow.',
        needs: 'D1 schemas, the routes, admin access, and an approved privacy and retention policy.',
        statuses: [
          { tone: 'complete', text: 'The workflows are implemented and documented.' },
          { tone: 'verify', text: 'An end-to-end submission, export, contact conversion, follow-up update, and authorization check.' },
        ],
        check: 'With approval, submit labeled test data, confirm it in the right admin view, check CSV safety, and remove the test data only with authorization.',
        refs: [{ label: 'Contacts', href: '/admin/contacts' }, { label: 'Calendar', href: '/admin/calendar' }, { label: 'Tickets', href: '/admin/tickets' }, { label: 'KPIs', href: '/admin/kpis' }],
      },
      {
        n: 12,
        title: 'Configure Google Workspace business mail',
        task: ['Verify the domain with Google, publish Google’s MX records, one SPF policy, DKIM, and a DMARC policy chosen from observed mail. Confirm licensed mailboxes, aliases, and routing. A Workspace login does not prove that mail is delivered or that DNS is set.'],
        why: 'A website and a forwarding address are not the same as a business mailbox. Mail authentication improves delivery and trust.',
        needs: 'DNS control, a Workspace administrator, and an approved mailbox plan.',
        statuses: [{ tone: 'verify', text: 'Domain verification, MX, SPF, DKIM, DMARC, licenses, mailboxes, aliases, and a real send/receive test. Do not publish guessed DNS values.' }],
        check: 'Send and receive external test mail. Inspect authentication results. Confirm aliases. Avoid a second SPF record.',
        refs: [{ label: 'Google Admin Help', href: 'https://support.google.com/a/' }],
      },
      {
        n: 13,
        title: 'Review analytics, scheduling links, and public integrations',
        task: ['Decide whether analytics or a scheduling link is wanted, which product it is, whether tracking is installed, what consent is required, and whether the booking destination belongs to the business. No live analytics events or booking flow were verified for this page.'],
        why: 'Measurement and booking links should produce useful, privacy-conscious results rather than dead ends.',
        needs: 'Approved provider accounts, a privacy decision, and the correct destination URL.',
        statuses: [{ tone: 'optional', text: 'Skip this if the owner does not need analytics or scheduling. If it is wanted, it still needs verification.' }],
        check: 'Inspect real events and, with approval, test the booking flow. Do not create a real appointment only to test a link.',
        refs: [{ label: 'Cloudflare Web Analytics', href: 'https://developers.cloudflare.com/web-analytics/' }, { label: 'Calendly Help', href: 'https://help.calendly.com/' }],
      },
    ],
  },
  {
    id: 'optional',
    title: 'Optional integrations — add only when needed',
    intro: 'These are not required to launch the website. An implemented screen is not the same as a live provider connection.',
    steps: [
      {
        n: 14,
        title: 'Calendar sync: ICS subscription or Google OAuth',
        optional: true,
        task: ['The admin has a private ICS feed at the route pattern /cal/<token>.ics, per-follow-up downloads, and a settings screen. Google push sync also needs ', C('GOOGLE_CLIENT_ID'), ', ', C('GOOGLE_CLIENT_SECRET'), ' an authorized refresh token, and the intended calendar. Recent Worker metadata did not list the Google OAuth secrets. D1 token state was not inspected. ICS and OAuth are not interchangeable.'],
        why: 'An ICS subscription is a simpler read-only view. OAuth lets the application update events.',
        needs: 'CRM follow-ups. OAuth also needs a Google project, an approved redirect URI, and calendar authorization.',
        statuses: [
          { tone: 'complete', text: 'The ICS and settings screens are implemented in the admin code.' },
          { tone: 'verify', text: 'Whether a private ICS feed is actually configured.' },
          { tone: 'pending', text: 'Live Google OAuth and event sync. They were not demonstrated and are not claimed here.' },
        ],
        check: 'Subscribe in private and check the event time zone. For OAuth, test create, update, and complete only with approval, on the intended calendar. Never put the private feed URL or token on this page.',
        refs: [{ label: 'Calendar settings', href: '/admin/calendar/settings' }, { label: 'Google Calendar API', href: 'https://developers.google.com/workspace/calendar/api/guides/overview' }],
      },
      {
        n: 15,
        title: 'xAI-powered Site AI',
        optional: true,
        task: ['Use a separate xAI API key as the Worker secret ', C('XAI_API_KEY'), '. The Worker calls the official chat-completions API with model grok-4.7 and sends the secret as a Bearer token, unchanged. The production script matches that path. Direct API tests returned HTTP 200. A signed-in chat at about 9:35 AM EST still showed xAI’s incorrect-API-key sentence. The stored secret could not be read back, so a byte mismatch is not proven and this page does not change the request. A Grok subscription and xAI API billing are separate.'],
        why: 'Site AI proposes allowlisted copy and CSS edits. Applying a reviewed proposal changes live overrides. It is not a general deployment tool.',
        needs: 'A working admin, the AI tables, valid API access, and an approved usage budget.',
        statuses: [
          { tone: 'complete', text: 'Binding XAI_API_KEY is secret_text, and a direct API call returned HTTP 200. The live chat function matches this source.' },
          { tone: 'verify', text: 'Signed-in Site AI still failed with xAI’s incorrect-key message at about 9:35 AM EST. That chat is not claimed live or fixed.' },
        ],
        check: 'Reload Site AI and send “Reply OK, propose no changes.” Confirm a new successful reply. Do not apply an edit just to test connectivity. Test proposal, apply, and revert only with explicit approval.',
        refs: [{ label: 'Site AI', href: '/admin/ai' }, { label: 'xAI console', href: 'https://console.x.ai' }, { label: 'Accounts and billing', href: 'https://docs.x.ai/developers/faq/accounts' }],
      },
      {
        n: 16,
        title: 'Cursor coding integration',
        optional: true,
        task: ['A securely supplied Cursor key passed a read-only agents API check (HTTP 200). No Cursor UI or API integration is implemented on this website, and none is added by this page. No Worker secret was created just to imply that the UI exists. Keep Cursor and xAI credentials separate.'],
        why: 'Cursor can support reviewed repository changes. It is not a drop-in replacement for the Site AI key.',
        needs: 'An accessible GitHub repository, an agreed workflow, a secure backend, and explicit approval before any chargeable job.',
        statuses: [{ tone: 'pending', text: 'Website integration is not implemented. Key validity was checked separately. This page does not add the Cursor UI.' }],
        check: 'After a future implementation, signed-in status and list calls work, secrets never reach the browser, and launching an agent requires a clear confirmation.',
        refs: [{ label: 'Cursor Cloud Agents API', href: 'https://cursor.com/docs/cloud-agent/api/endpoints' }],
      },
      {
        n: 17,
        title: 'Authentisign signing service',
        optional: true,
        task: ['The admin can log signing status and open Authentisign in the browser. A future API helper would need ', C('LW_USER_ID'), ', ', C('LW_ACCESS_TOKEN'), ', ', C('LW_SUBSCRIPTION_KEY'), ', and ', C('LW_WEBHOOK_SECRET'), '. The public webhook stub returns 501. Those secrets were absent from the verified Worker metadata.'],
        why: 'A signing log is useful without claiming that documents are sent or updated automatically.',
        needs: 'Provider entitlement, an approved API integration, secure credentials, and webhook verification.',
        statuses: [
          { tone: 'complete', text: 'Manual logging and the external link are implemented.' },
          { tone: 'pending', text: 'Automated API and webhook sync. It is not live.' },
        ],
        check: 'Confirm the manual log with approval. Do not send a document or a signature request as a test. A future webhook must be validated before it changes records.',
        refs: [{ label: 'Signings', href: '/admin/signings' }, { label: 'Authentisign', href: 'https://authentisign.com/' }],
      },
      {
        n: 18,
        title: 'Payments and outbound notifications',
        optional: true,
        task: ['Add checkout, transactional email, or calendar email invitations only if the owner asks. No functioning card checkout or automatic notification service was verified. Stored forms and a business mailbox do not send those messages by themselves.'],
        why: 'Payments and outbound messages move money or reach customers, and they add operational duties.',
        needs: 'An approved requirement, provider setup, legal terms, and a secure implementation.',
        statuses: [{ tone: 'optional', text: 'Not verified as implemented. Leave it off until there is a real request.' }],
        check: 'Use the provider’s test mode first. Approve a real charge or a real message separately.',
        refs: [{ label: 'Stripe documentation', href: 'https://docs.stripe.com/' }],
      },
    ],
  },
  {
    id: 'care',
    title: 'Launch and ongoing care',
    intro: 'A home page that loads is not the same as a site someone can operate next month.',
    steps: [
      {
        n: 19,
        title: 'Backups, monitoring, and launch approval',
        task: ['Keep private source backups, D1 exports, a restore drill, a DNS inventory, uptime and error checks, and a rollback plan. Preserve live override records when planning recovery. No complete backup routine or restore drill is evidenced here.'],
        why: 'The site is not operationally ready only because the home page loads.',
        needs: 'The repository, known resource owners, and an approved data-retention policy.',
        statuses: [{ tone: 'verify', text: 'Backups, monitoring, a restore drill, and owner launch sign-off are still open.' }],
        check: 'Confirm a clean build, public and mobile pages, redirects and TLS, forms, admin protection, mail delivery, and each integration that is actually enabled. Restore into a safe environment. Get owner sign-off.',
        refs: [{ label: 'D1 recovery', href: 'https://developers.cloudflare.com/d1/reference/time-travel/' }, { label: 'Workers observability', href: 'https://developers.cloudflare.com/workers/observability/' }],
      },
      {
        n: 20,
        title: 'Maintain ownership, renewals, and costs',
        task: ['On an agreed cadence, review domain and mailbox renewals, provider usage, API spending, permissions, security updates, dependency and build checks, backups, content, and broken links. This page does not create a recurring job.'],
        why: 'Cost and security follow continued use and provider settings. A one-time estimate is not a billing inventory.',
        needs: 'A named owner for the domain, DNS, repository, mail, hosting, and each integration.',
        statuses: [{ tone: 'pending', text: 'Maintenance owners, a cadence, and a verified look at current invoices. Earlier estimates are not current prices. A Cloudflare free-plan document does not prove every other account is free.' }],
        check: 'Read the actual invoices and renewal dates. Rotate a key that may have leaked. Test recovery. This checklist does not authorize a charge or a plan change.',
        refs: [{ label: 'Repository', href: 'https://github.com/mjmorrow1/morrow-media' }],
      },
    ],
  },
];

function setupInline(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  return list.map((p) => (p && typeof p === 'object' ? `<code>${escH(p.c)}</code>` : escH(p))).join('');
}
function setupHref(href) {
  const h = String(href || '');
  if (/^\/(?!\/)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/.test(h)) return { href: h, external: false };
  if (/^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(h)) return { href: h, external: true };
  return null;
}
function setupStatuses(list) {
  return `<ul class="setup-statuses">${list.map((s) => {
    const label = SETUP_TONE[s.tone] || 'Needs verification';
    return `<li><span class="badge st-${escH(s.tone)}">${escH(label)}</span><span>${escH(s.text)}</span></li>`;
  }).join('')}</ul>`;
}
function setupRefs(list) {
  const items = (list || []).map((r) => {
    const safe = setupHref(r.href);
    if (!safe) return '';
    const attrs = safe.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<li><a href="${escH(safe.href)}"${attrs}>${escH(r.label)}</a></li>`;
  }).join('');
  return items ? `<ul class="setup-refs">${items}</ul>` : '';
}
function setupStep(step) {
  const optional = step.optional ? '<span class="badge st-optional">Optional</span> ' : '';
  return `<li id="step-${step.n}"><h3><span class="step-no">${step.n}.</span>${optional}${escH(step.title)}</h3>
${setupStatuses(step.statuses)}
<h4 class="step-k">Do</h4><p>${setupInline(step.task)}</p>
<h4 class="step-k">Why</h4><p>${escH(step.why)}</p>
<h4 class="step-k">Prerequisites</h4><p>${escH(step.needs)}</p>
<h4 class="step-k">Check</h4><p>${escH(step.check)}</p>
${setupRefs(step.refs)}</li>`;
}
function setupGuidePage() {
  const jump = SETUP_SECTIONS.map((s) => `<a href="#${s.id}">${escH(s.title.split('—')[0].trim())}</a>`).join('');
  const sections = SETUP_SECTIONS.map((s) => `<section class="setup-sec" id="${s.id}"><h2>${escH(s.title)}</h2><p>${escH(s.intro)}</p><ol class="setup-steps" start="${s.steps[0].n}">${s.steps.map(setupStep).join('')}</ol></section>`).join('');
  const body = `<p class="eyebrow">Reviewed November 8, 2026 · Eastern time (EST)</p><h1>Setup <em>guide</em></h1>
<div class="setup-banner"><p>This is a reviewed snapshot, not a live detector. <b>Complete</b> means the evidence named in that line. <b>Needs verification</b> still needs a live check. <b>Pending</b> is unfinished. <b>Optional</b> is not a launch requirement. Nothing here saves a checkbox, buys a service, rotates a key, sends mail, or changes the live site.</p>
<p>Recommended setup order for the next site: follow the numbered steps below. It is not a claim that Morrow Media historically followed this sequence. For future sites, put a private GitHub repository in place early. Morrow Media was built and deployed on Cloudflare before this repository existed. On November 8, 2026 Cursor gained access and the sanitized source was committed in git. GitHub reported the repository as public. This page is not on the live site until a Worker script deploy is finished and checked while signed in.</p>
<p>Separate from that order: admin, CRM, and optional tools were added on the existing Cloudflare site. The same day, the xAI secret was configured and replaced after an invalid-key report. Direct API tests passed. The signed-in Site AI chat still returned xAI’s incorrect-key message at about 9:35 AM EST, and the cause is not proven. A Cursor key passed a read-only test, and this website has no Cursor UI. Google Workspace mailbox and DNS status is unverified. Calendar OAuth and Authentisign automation are not claimed live. Do not invent any other chronology from this list.</p></div>
<nav class="setup-jump" aria-label="Guide sections">${jump}</nav>
${sections}
<section class="setup-banner" id="maintain"><h2>How to update this page</h2><p>Edit <code>cf/setup-src.js</code> after a new check. Name the evidence and the date. Rebuild to preview it with the Worker dev server, and run <code>npm run setup-guide-check</code>. Do not mark mail, OAuth, Authentisign, Cursor, or the GitHub privacy step complete only because this page shipped. Deploying the change to the live Worker is a separate decision.</p></section>`;
  return adminPage('Setup guide', 'setup', body);
}
