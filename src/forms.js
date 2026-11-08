const { esc } = require('./layout');

const f = {
  text: (name, label, { req, type = 'text', ph = '', half } = {}) =>
    `<label class="field${half ? ' half' : ''}"><span>${label}${req ? ' *' : ''}</span><input type="${type}" name="${name}" ${req ? 'required' : ''} placeholder="${esc(ph)}"></label>`,
  area: (name, label, { req, ph = '' } = {}) =>
    `<label class="field"><span>${label}${req ? ' *' : ''}</span><textarea name="${name}" rows="4" ${req ? 'required' : ''} placeholder="${esc(ph)}"></textarea></label>`,
  select: (name, label, opts, { req, half } = {}) =>
    `<label class="field${half ? ' half' : ''}"><span>${label}${req ? ' *' : ''}</span><select name="${name}" ${req ? 'required' : ''}><option value="">Select…</option>${opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`,
  chips: (name, label, opts) =>
    `<fieldset class="field chips"><legend>${label}</legend><div>${opts.map((o) => `<label class="chip"><input type="checkbox" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`,
};

const wrap = (type, inner, submit) => `
<form class="lead-form" method="post" action="/api/submit/${type}" data-lead-form>
  <div class="form-grid">${inner}</div>
  <div class="hp" aria-hidden="true"><label>Leave blank<input name="website_url" tabindex="-1" autocomplete="off"></label></div>
  <div class="form-foot"><button class="btn btn-solid" type="submit">${submit}</button><p class="form-msg" role="status" aria-live="polite"></p></div>
</form>`;

const sponsorForm = (c, preTier = '') => wrap('sponsor', [
  f.text('company', 'Company', { req: true, half: true }),
  f.text('contact_name', 'Contact name', { req: true, half: true }),
  f.text('email', 'Email', { req: true, type: 'email', half: true }),
  f.text('phone', 'Phone', { type: 'tel', half: true }),
  f.select('industry', 'Industry', ['Health & Fitness', 'Running / Sporting Goods', 'Food & Beverage', 'Restaurant', 'Hotel / Hospitality', 'Healthcare', 'Real Estate', 'Financial Services', 'Automotive', 'Retail', 'Local Business', 'Other'], { half: true }),
  `<label class="field half"><span>Tier of interest *</span><select name="tier" required data-tier-select><option value="">Select…</option>${c.tiers.map((t) => `<option value="${esc(t.name)}"${t.name === preTier ? ' selected' : ''}>${esc(t.name)}${c.showPricing ? ` · ${esc(t.price)}` : ''}</option>`).join('')}<option value="Not sure yet">Not sure yet</option></select></label>`,
  f.select('budget', 'Budget', ['Under $1K', '$1K–$2K', '$2K–$5K', '$5K+', 'Not sure yet'], { half: true }),
  `<label class="field half"><span>Campaign</span><input value="${esc(c.client)}" disabled></label>`,
  f.area('notes', 'Notes', { ph: 'Goals, audience, activation ideas, questions…' }),
].join(''), 'Send sponsor inquiry');

const LEGAL_MATTERS = ['LLC formation & structure', 'Sponsorship / partnership contract', 'Creator / talent agreement', 'Event agreement', 'IP / trademark', 'NDA', 'Contract review', 'Other'];
const legalForm = () => wrap('legal', [
  f.text('contact_name', 'Your name', { req: true, half: true }),
  f.text('email', 'Email', { req: true, type: 'email', half: true }),
  f.text('phone', 'Phone', { type: 'tel', half: true }),
  f.text('company', 'Business / organization', { half: true, ph: 'Optional' }),
  f.select('matter', 'Type of matter', LEGAL_MATTERS, { req: true, half: true }),
  f.text('timeline', 'Timeline', { half: true, ph: 'e.g. Contract due by March 1' }),
  f.area('details', 'What do you need help with?', { ph: 'A short, general description. Please don\'t include confidential details yet.' }),
].join(''), 'Request a consultation');

const brandForm = () => wrap('brand', [
  f.text('company', 'Company', { req: true, half: true }),
  f.text('contact_name', 'Your name', { req: true, half: true }),
  f.text('email', 'Email', { req: true, type: 'email', half: true }),
  f.text('phone', 'Phone', { type: 'tel', half: true }),
  f.select('industry', 'Industry', ['Restaurant', 'Hotel / Hospitality', 'Real Estate', 'Property Development', 'Tourism', 'Automotive', 'Retail', 'Consumer Brand', 'Local Business', 'Other'], { half: true }),
  f.text('location', 'Location', { half: true, ph: 'City, State' }),
  f.text('website', 'Website or Instagram', { ph: 'https://' }),
  f.chips('interests', 'What are you looking for?', ['Content', 'Social media', 'Influencers / creators', 'Events', 'Sponsorship opportunities', 'Marketing campaign', 'Real estate media', 'Legal / contracts']),
  f.area('goals', 'Marketing goals', { ph: 'Who do you want to reach, and what does success look like?' }),
  f.select('budget', 'Budget', ['Under $2.5k', '$2.5k–$5k', '$5k–$10k', '$10k–$25k', '$25k+', 'Not sure yet'], { half: true }),
  f.text('timeline', 'Timeline', { half: true, ph: 'e.g. Launching in March' }),
].join(''), 'Start a campaign');

const creatorForm = () => wrap('creator', [
  f.text('name', 'Name', { req: true, half: true }),
  f.text('email', 'Email', { req: true, type: 'email', half: true }),
  f.text('location', 'Location', { half: true, ph: 'City, State' }),
  f.select('platform', 'Primary platform', ['Instagram', 'TikTok', 'YouTube', 'Multi-platform', 'Other'], { half: true }),
  f.text('instagram', 'Instagram', { half: true, ph: '@handle' }),
  f.text('tiktok', 'TikTok', { half: true, ph: '@handle' }),
  f.text('youtube', 'YouTube', { half: true, ph: 'Channel URL' }),
  f.text('followers', 'Followers (total)', { half: true, ph: 'e.g. 48k' }),
  f.text('avg_views', 'Average views', { half: true, ph: 'Per post / reel' }),
  f.text('engagement', 'Engagement rate', { half: true, ph: 'e.g. 4.2%' }),
  f.chips('niche', 'Content categories', ['Travel', 'Food', 'Lifestyle', 'Hospitality', 'Fashion', 'Fitness', 'Real estate', 'Photography / video', 'Family', 'Outdoors']),
  f.area('audience', 'Audience demographics', { ph: 'Top locations, age range, gender split…' }),
  f.text('portfolio', 'Portfolio / media kit link', { ph: 'https://' }),
  f.text('rates', 'Rates', { half: true, ph: 'e.g. Reel $500, Story set $200' }),
  f.text('availability', 'Availability', { half: true, ph: 'e.g. Weekends, from June' }),
  f.select('travel', 'Travel availability', ['Local only', 'Florida', 'U.S.', 'International']),
].join(''), 'Join the Creator Network');

const eventForm = () => wrap('event', [
  f.text('event_name', 'Event name', { req: true, half: true }),
  f.text('organizer', 'Organizer / your name', { req: true, half: true }),
  f.text('email', 'Email', { req: true, type: 'email', half: true }),
  f.text('phone', 'Phone', { type: 'tel', half: true }),
  f.select('event_type', 'Event type', ['Festival', 'Concert', 'Sporting event', 'Conference', 'Charity event', 'Nightlife', 'Tourism event', 'Private event', 'Other'], { half: true }),
  f.text('event_date', 'Date', { type: 'date', half: true }),
  f.text('location', 'Location / venue', { half: true }),
  f.text('attendance', 'Expected attendance', { half: true, ph: 'e.g. 5,000' }),
  f.text('audience', 'Who is your audience?', { ph: 'Age, interests, where they come from' }),
  f.chips('needs', 'What do you need?', ['Sponsors', 'Sponsor packages / deck', 'Event media', 'Creator / influencer activation', 'Event marketing']),
  f.area('sponsor_needs', 'Tell us about the event and your sponsorship goals'),
].join(''), 'Talk about your event');

module.exports = { sponsorForm, brandForm, creatorForm, eventForm, legalForm, LEGAL_MATTERS };
