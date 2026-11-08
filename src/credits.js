// Third-party photo credits (all Wikimedia Commons, commercial use allowed with attribution).
// Shown on /credits and as small credit lines on the images. Mirror of CREDITS.md.
const list = [
  {
    key: 'hero',
    title: 'Downtown St. Petersburg skyline at sunset from Demens Landing Park',
    file: 'public/images/stpete/hero-demens-landing-sunset.webp (+ -1280.webp)',
    thumb: '/images/stpete/hero-demens-landing-sunset-1280.webp',
    usedOn: 'Home hero',
    author: 'Gregory Urbano',
    license: 'CC BY 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Sitting_by_the_dock_on_the_bay._(28240365509).jpg',
    changes: 'Resized and converted to WebP',
    short: 'Photo: Gregory Urbano, CC BY 2.0',
  },
  {
    key: 'skyline',
    title: 'St. Petersburg, Florida skyline just before sunrise',
    file: 'public/images/stpete/skyline-sunrise.webp (+ -1280.webp)',
    thumb: '/images/stpete/skyline-sunrise-1280.webp',
    usedOn: 'Sponsorships: St. Pete Marathon featured campaign',
    author: 'Andrew Heneen',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:St._Petersburg_Florida_skyline_at_sunrise_1.jpg',
    changes: 'Resized and converted to WebP',
    short: 'Photo: Andrew Heneen, CC BY 4.0',
  },
];
module.exports = { list, byKey: Object.fromEntries(list.map((c) => [c.key, c])) };
