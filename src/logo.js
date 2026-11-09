// Original SouthBridge Media lockup.
// Two-pylon cable-stayed bridge drawn as geometry for this mark. Not a trace.
const BRAND = 'SouthBridge Media';

function markPaths() {
  const cables = [
    'M44 16 L4 51',
    'M44 16 L14 49',
    'M44 16 L24 47.4',
    'M44 16 L34 46.6',
    'M44 17 L54 46',
    'M44 17 L64 45.8',
    'M96 9 L62 45.8',
    'M96 9 L74 45.4',
    'M96 9 L86 45.2',
    'M96 10 L108 47.6',
    'M96 10 L120 51',
    'M96 10 L134 55',
    'M96 10 L148 60',
  ];
  const cable = cables.map((d) => `<path d="${d}"/>`).join('');
  return `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.45">${cable}</g>
    <path d="M41 48 V14 h6 V48" fill="currentColor" stroke="none"/>
    <path d="M93 46.4 V6 h6.6 V46.4" fill="currentColor" stroke="none"/>
    <path d="M2 52.5 C 38 42.5, 98 43, 154 62" stroke-width="3.5"/>
    <g stroke-width="2.05">
      <path d="M16 51 V66"/>
      <path d="M44 47.6 V66"/>
      <path d="M70 45.6 V66"/>
      <path d="M96 46.2 V66"/>
      <path d="M124 52.4 V66"/>
    </g>
  </g>`;
}

// Bridge occupies the left of a 0 0 156 68 box. Scale it beside the wordmark.
function wordmarkSvg({ hidden = true, color = '' } = {}) {
  const a11y = hidden
    ? 'aria-hidden="true" focusable="false"'
    : `role="img" aria-label="${BRAND}" focusable="false"`;
  const paint = color ? ` color="${color}"` : '';
  return `<svg class="logo-lockup" viewBox="0 0 276 64" ${a11y}${paint} xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0 8) scale(0.7)">${markPaths()}</g>
  <g fill="currentColor" stroke="none" font-family="Inter, Arial, Helvetica, sans-serif">
    <text x="116" y="28" font-size="20" font-weight="600" letter-spacing="0.2">SOUTHBRIDGE</text>
    <text x="116.2" y="50" font-size="18" font-weight="300" letter-spacing="6.4">MEDIA</text>
  </g>
</svg>`;
}

// Heavier drawing of the same bridge so a 16–32px favicon still reads.
function iconPaths() {
  const cables = [
    'M18 8 L3 24', 'M18 8 L9 23', 'M18 8 L14 22.6',
    'M18 8.4 L23 22.4', 'M18 8.4 L28 22.2',
    'M40 5 L28 22.2', 'M40 5 L34 21.8', 'M40 5 L38 21.8',
    'M40 5.4 L46 23', 'M40 5.4 L54 25.2', 'M40 5.4 L62 28',
  ];
  const cable = cables.map((d) => `<path d="${d}"/>`).join('');
  return `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.35">${cable}</g>
    <path d="M16.3 23.2 V7.2 h3.4 V23.2" fill="currentColor" stroke="none"/>
    <path d="M38.2 22.2 V3.6 h3.6 V22.2" fill="currentColor" stroke="none"/>
    <path d="M1 25 C 16 20.5, 40 21, 63 29.2" stroke-width="2.4"/>
    <g stroke-width="1.7"><path d="M8 24.4 V33"/><path d="M18 22.6 V33"/><path d="M30 21.8 V33"/><path d="M40 22.2 V33"/><path d="M52 25.2 V33"/></g>
  </g>`;
}

function iconSvg({ color = '#0d0d0c' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${BRAND}">
  <g transform="translate(0 14)" color="${color}">${iconPaths()}</g>
</svg>`;
}

function markSvg({ color = '#0d0d0c' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 4 156 68" role="img" aria-label="${BRAND}">
  <g color="${color}">${markPaths()}</g>
</svg>`;
}

module.exports = { BRAND, lockupSvg: wordmarkSvg, markSvg, markPaths, wordmarkSvg, iconSvg };
