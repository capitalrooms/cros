// The London scenes for the quarterly market insight (12 Nov 2026, Harry: "3 versions of a 4 quarter market insight with
// a London scene and then the season in question"). One skyline — the Shard, the Gherkin, St Paul's, Big Ben, the
// London Eye, Tower Bridge over the river — drawn three ways (editorial flat colour, ink like our videos, a bold
// graphic silhouette) in four seasons. Written as SVG, saved as PNG so every email app shows them.
// Run: node scripts/insight-scenes.mjs → public/email/insight/<style>-<season>.png
import sharp from 'sharp'
import fs from 'node:fs'

const W = 1200, H = 480, GROUND = 380
// a steady scatter (the same every run) so snow and leaves don't fall in lines
const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }
const SEASONS = {
  winter: { sky: ['#C9D9E6', '#EEF3F7'], tree: '#7C8A8F', leaf: null, water: '#9FB6C4', accent: '#FFFFFF', sun: null, extra: 'snow' },
  spring: { sky: ['#BFE3EF', '#F4FAF6'], tree: '#6E5A48', leaf: '#F6B6C8', water: '#8DC6D6', accent: '#F6B6C8', sun: '#FFE9A8', extra: 'blossom' },
  summer: { sky: ['#7EC4EA', '#DFF2FB'], tree: '#5A4636', leaf: '#4E9A5B', water: '#4FA3C7', accent: '#F2A541', sun: '#FFD45C', extra: 'boats' },
  autumn: { sky: ['#F3C892', '#FBEBD6'], tree: '#5A4636', leaf: '#D9762B', water: '#7BA7B5', accent: '#D9762B', sun: '#F7A65A', extra: 'leaves' },
}
const STYLES = {
  // soft flat colour, no outlines — a magazine cover
  editorial: { stroke: 'none', sw: 0, building: ['#E9E1D3', '#D8CCB8', '#CBBDA6'], dark: '#3F4A44', glass: '#B9CCD4' },
  // our ink look: bold black outlines, flat brand fills (the colour room palette)
  ink: { stroke: '#151515', sw: 5, building: ['#FFFFFF', '#DDE8DF', '#F1D3A8'], dark: '#2F6B4F', glass: '#9FD3E0' },
  // one colour, a strong silhouette, the season as an accent
  graphic: { stroke: 'none', sw: 0, building: ['#1F3B2E', '#1F3B2E', '#1F3B2E'], dark: '#1F3B2E', glass: '#1F3B2E' },
}

function scene(styleKey, seasonKey) {
  const st = STYLES[styleKey], se = SEASONS[seasonKey]
  const s = st.stroke, sw = st.sw, b = st.building
  const g = styleKey === 'graphic'
  const sky = g ? `<rect width="${W}" height="${H}" fill="${se.sky[1]}"/>` : `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${se.sky[0]}"/><stop offset="1" stop-color="${se.sky[1]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`
  const sun = se.sun ? `<circle cx="${seasonKey === 'autumn' ? 980 : 1020}" cy="${seasonKey === 'autumn' ? 150 : 110}" r="${g ? 70 : 48}" fill="${g ? se.accent : se.sun}" stroke="${s}" stroke-width="${sw}" ${g ? 'opacity="0.9"' : ''}/>` : (g ? `<circle cx="1020" cy="110" r="70" fill="#FFFFFF" opacity="0.8"/>` : '')
  const P = (d, fill) => `<path d="${d}" fill="${fill}" stroke="${s}" stroke-width="${sw}" stroke-linejoin="round"/>`
  // the skyline, left to right
  const eye = `<g><circle cx="170" cy="250" r="105" fill="none" stroke="${g ? st.dark : (styleKey === 'ink' ? '#151515' : '#6F7C76')}" stroke-width="${g ? 10 : 6}"/>${Array.from({ length: 12 }).map((_, i) => { const a = i * Math.PI / 6; return `<line x1="170" y1="250" x2="${170 + Math.cos(a) * 105}" y2="${250 + Math.sin(a) * 105}" stroke="${g ? st.dark : '#9AA6A0'}" stroke-width="${g ? 3 : 2}"/>` }).join('')}${Array.from({ length: 12 }).map((_, i) => { const a = i * Math.PI / 6; return `<circle cx="${170 + Math.cos(a) * 105}" cy="${250 + Math.sin(a) * 105}" r="${g ? 8 : 7}" fill="${g ? st.dark : st.glass}" stroke="${s}" stroke-width="${sw ? 3 : 0}"/>` }).join('')}${P('M150 360 L170 250 L190 360 Z', g ? st.dark : b[1])}</g>`
  const bigBen = `<g>${P('M300 360 L300 170 L340 170 L340 360 Z', b[2])}${P('M296 170 L320 110 L344 170 Z', g ? st.dark : st.dark)}<circle cx="320" cy="200" r="13" fill="${g ? se.sky[1] : '#FFFFFF'}" stroke="${s}" stroke-width="${sw ? 3 : 0}"/>${P('M340 360 L340 250 L420 250 L420 360 Z', b[1])}</g>`
  const stPauls = `<g>${P('M460 360 L460 280 L580 280 L580 360 Z', b[0])}${P('M480 280 Q520 200 560 280 Z', b[1])}${P('M514 222 L520 196 L526 222 Z', st.dark)}</g>`
  const gherkin = `<g>${P('M640 360 C 610 300, 615 200, 660 170 C 705 200, 710 300, 680 360 Z', g ? st.dark : st.glass)}${g ? '' : `<path d="M628 300 Q660 280 692 300 M622 250 Q660 230 698 250 M632 205 Q660 190 688 205" stroke="${styleKey === 'ink' ? '#151515' : '#8FA9B3'}" stroke-width="${sw ? 3 : 2}" fill="none"/>`}</g>`
  const shard = `<g>${P('M760 360 L800 60 L840 360 Z', g ? st.dark : st.glass)}${g ? '' : `<path d="M800 60 L812 360" stroke="${styleKey === 'ink' ? '#151515' : '#9DB4BD'}" stroke-width="${sw ? 3 : 2}"/>`}${P('M700 360 L700 300 L760 300 L760 360 Z', b[1])}${P('M840 360 L840 270 L900 270 L900 360 Z', b[0])}</g>`
  // Tower Bridge over the river
  const bridge = `<g>${P('M930 360 L930 230 L970 230 L970 360 Z', b[2])}${P('M1070 360 L1070 230 L1110 230 L1110 360 Z', b[2])}${P('M926 230 L950 195 L974 230 Z', st.dark)}${P('M1066 230 L1090 195 L1114 230 Z', st.dark)}${P('M970 250 L1070 250 L1070 262 L970 262 Z', g ? st.dark : '#6FA0C4')}${P('M900 330 Q950 340 970 300 M1110 300 Q1130 340 1200 330', 'none')}${P('M970 330 L1070 330 L1070 342 L970 342 Z', g ? st.dark : '#6FA0C4')}</g>`
  const river = `<rect x="0" y="${GROUND}" width="${W}" height="${H - GROUND}" fill="${g ? st.dark : se.water}"/>${g ? '' : Array.from({ length: 9 }).map((_, i) => `<path d="M${40 + i * 135} ${GROUND + 30 + (i % 3) * 22} l 50 0" stroke="${styleKey === 'ink' ? '#151515' : '#FFFFFF'}" stroke-width="${sw ? 3 : 3}" opacity="${styleKey === 'ink' ? 0.6 : 0.7}" stroke-linecap="round"/>`).join('')}<rect x="0" y="${GROUND - 20}" width="${W}" height="20" fill="${g ? st.dark : (styleKey === 'ink' ? '#FFFFFF' : '#CFC6B4')}" stroke="${s}" stroke-width="${sw}"/>`
  // trees along the embankment, dressed for the season
  const trees = [60, 400, 600, 880, 1160].map((x, i) => {
    const trunk = `<rect x="${x - 5}" y="${GROUND - 70}" width="10" height="52" fill="${g ? st.dark : se.tree}" stroke="${s}" stroke-width="${sw ? 3 : 0}"/>`
    if (!se.leaf) return trunk + `<path d="M${x} ${GROUND - 60} l -22 -30 M${x} ${GROUND - 50} l 24 -28 M${x} ${GROUND - 66} l 0 -24" stroke="${g ? st.dark : se.tree}" stroke-width="${sw ? 5 : 4}" stroke-linecap="round"/>`
    return trunk + `<circle cx="${x}" cy="${GROUND - 92}" r="${30 + (i % 2) * 6}" fill="${g ? se.accent : se.leaf}" stroke="${s}" stroke-width="${sw ? 4 : 0}"/>`
  }).join('')
  // the season's own touch
  let extra = ''
  if (se.extra === 'snow') extra = Array.from({ length: 70 }).map((_, i) => `<circle cx="${Math.round(rnd(i, 1) * W)}" cy="${Math.round(rnd(i, 2) * (GROUND - 30))}" r="${2 + (i % 3)}" fill="${g ? st.dark : '#FFFFFF'}" opacity="${g ? 0.35 : 0.95}" ${styleKey === 'ink' ? 'stroke="#151515" stroke-width="1"' : ''}/>`).join('') + `<rect x="0" y="${GROUND - 24}" width="${W}" height="6" fill="#FFFFFF" opacity="${g ? 0 : 1}"/>`
  if (se.extra === 'blossom') extra = Array.from({ length: 40 }).map((_, i) => `<circle cx="${Math.round(rnd(i, 3) * W)}" cy="${Math.round(60 + rnd(i, 4) * 280)}" r="${3 + (i % 2)}" fill="${g ? se.accent : '#F6B6C8'}" opacity="0.9"/>`).join('')
  if (se.extra === 'leaves') extra = Array.from({ length: 36 }).map((_, i) => { const x = Math.round(rnd(i, 5) * W), y = Math.round(60 + rnd(i, 6) * 290); return `<ellipse cx="${x}" cy="${y}" rx="7" ry="4" fill="${g ? se.accent : (i % 2 ? '#D9762B' : '#E8B04A')}" transform="rotate(${Math.round(rnd(i, 7) * 180)} ${x} ${y})" ${styleKey === 'ink' ? 'stroke="#151515" stroke-width="1.5"' : ''}/>` }).join('')
  if (se.extra === 'boats') extra = [[220, 0], [700, 1]].map(([x, k]) => `<g>${P(`M${x} ${GROUND + 50} l 120 0 l -16 22 l -88 0 Z`, g ? se.accent : '#FFFFFF')}${P(`M${x + 30} ${GROUND + 50} l 0 -18 l 50 0 l 0 18 Z`, g ? se.accent : (k ? '#F2A541' : '#E4573D'))}</g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${sky}${sun}${eye}${bigBen}${stPauls}${gherkin}${shard}${bridge}${trees}${river}${extra}</svg>`
}

for (const st of Object.keys(STYLES)) for (const se of Object.keys(SEASONS)) {
  await sharp(Buffer.from(scene(st, se))).png({ compressionLevel: 9 }).toFile(`public/email/insight/${st}-${se}.png`)
}
console.log('done', fs.readdirSync('public/email/insight').length)
