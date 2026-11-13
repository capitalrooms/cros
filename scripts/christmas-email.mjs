// The Christmas email theme's pictures (13 Nov 2026, Harry: "the style is really bad and not even christmassy"):
// a header — London at night under snow, a lit Christmas tree, fairy lights strung across the top, "Season's greetings"
// — and a holly garland for above the footer. Drawn as SVG in the house illustration style, saved as PNG.
// Run: node scripts/christmas-email.mjs → public/email/themes/christmas-header.png, christmas-holly.png
import sharp from 'sharp'
import fs from 'node:fs'

const W = 1200, H = 560, GROUND = 470
const ink = '#0B1F14'
const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }
const win = (x, y, w, h, cols, rows, seed) => Array.from({ length: cols * rows }).map((_, i) => {
  const cx = x + 8 + (i % cols) * ((w - 16) / cols), cy = y + 10 + Math.floor(i / cols) * ((h - 20) / rows)
  return rnd(i, seed) > 0.45 ? `<rect x="${cx}" y="${cy}" width="7" height="10" fill="#F6D776" opacity="${0.6 + rnd(i, seed + 1) * 0.4}"/>` : ''
}).join('')

const sky = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E2418"/><stop offset="0.7" stop-color="#1D4A33"/><stop offset="1" stop-color="#2C5E43"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#F6D776" stop-opacity="0.55"/><stop offset="1" stop-color="#F6D776" stop-opacity="0"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>`
const stars = Array.from({ length: 60 }).map((_, i) => `<circle cx="${Math.round(rnd(i, 1) * W)}" cy="${Math.round(90 + rnd(i, 2) * 220)}" r="${1 + (i % 3) * 0.7}" fill="#FFF8E1" opacity="${0.4 + rnd(i, 3) * 0.6}"/>`).join('')
const moon = `<circle cx="860" cy="120" r="40" fill="#FFF3C4"/><circle cx="876" cy="110" r="35" fill="#163A27"/>`
// the skyline in silhouette with lit windows
const S = '#123122'
const skyline = `
  <g fill="${S}">
    <circle cx="150" cy="330" r="92" fill="none" stroke="${S}" stroke-width="8"/>${Array.from({ length: 10 }).map((_, i) => { const a = i * Math.PI / 5; return `<line x1="150" y1="330" x2="${150 + Math.cos(a) * 92}" y2="${330 + Math.sin(a) * 92}" stroke="${S}" stroke-width="3"/>` }).join('')}<path d="M135 ${GROUND} L150 330 L165 ${GROUND} Z"/>
    <rect x="270" y="240" width="44" height="${GROUND - 240}"/><path d="M266 240 L292 175 L318 240 Z"/><circle cx="292" cy="270" r="13" fill="#F6D776"/>
    <rect x="314" y="330" width="90" height="${GROUND - 330}"/>${win(314, 330, 90, 120, 4, 4, 5)}
    <rect x="430" y="360" width="120" height="${GROUND - 360}"/><path d="M450 360 Q490 290 530 360 Z"/>${win(430, 380, 120, 80, 5, 3, 9)}
    <path d="M600 ${GROUND} C 572 400, 576 300, 618 270 C 660 300, 664 400, 636 ${GROUND} Z"/>${win(590, 320, 56, 140, 2, 5, 13)}
    <path d="M700 ${GROUND} L742 120 L784 ${GROUND} Z"/>${win(712, 260, 60, 200, 2, 7, 17)}
    <rect x="800" y="380" width="70" height="${GROUND - 380}"/>${win(800, 380, 70, 80, 3, 3, 21)}
  </g>`
// a big decorated tree on the right, glowing
const baubles = [[1010, 300, '#D7263D'], [985, 345, '#F6D776'], [1040, 350, '#2F80ED'], [970, 395, '#D7263D'], [1015, 400, '#F6D776'], [1060, 405, '#D7263D'], [995, 260, '#F6D776'], [1030, 265, '#D7263D']]
const tree = `
  <circle cx="1015" cy="330" r="190" fill="url(#glow)"/>
  <path d="M1015 190 L945 290 L975 290 L925 360 L960 360 L905 440 L1125 440 L1070 360 L1105 360 L1055 290 L1085 290 Z" fill="#1F6B3F" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M955 300 Q1015 330 1075 296 M935 372 Q1015 404 1097 368" fill="none" stroke="#F6D776" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round"/>
  ${baubles.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="11" fill="${c}" stroke="${ink}" stroke-width="3"/>`).join('')}
  <rect x="1000" y="440" width="30" height="30" fill="#6B3F22" stroke="${ink}" stroke-width="4"/>
  <path d="M1015 150 L1024 176 L1051 176 L1029 192 L1037 218 L1015 202 L993 218 L1001 192 L979 176 L1006 176 Z" fill="#F6D776" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
  ${[[930, 455, '#D7263D', 50, 30], [1075, 455, '#2F80ED', 44, 30], [1125, 460, '#F6D776', 36, 24]].map(([x, y, c, w, h]) => `<rect x="${x}" y="${y - h + 15}" width="${w}" height="${h}" fill="${c}" stroke="${ink}" stroke-width="4"/><rect x="${x + w / 2 - 4}" y="${y - h + 15}" width="8" height="${h}" fill="#FFF8E1"/>`).join('')}`
// snow on the ground and falling
const ground = `<path d="M0 ${GROUND} Q300 ${GROUND - 14} 600 ${GROUND} T1200 ${GROUND} L1200 ${H} L0 ${H} Z" fill="#F4F7F5"/><path d="M0 ${GROUND + 30} Q400 ${GROUND + 18} 800 ${GROUND + 34} T1200 ${GROUND + 26}" fill="none" stroke="#DCE6E0" stroke-width="5"/>`
const snow = Array.from({ length: 110 }).map((_, i) => `<circle cx="${Math.round(rnd(i, 7) * W)}" cy="${Math.round(60 + rnd(i, 8) * (GROUND - 60))}" r="${1.5 + (i % 4)}" fill="#FFFFFF" opacity="${0.55 + rnd(i, 9) * 0.45}"/>`).join('')
// fairy lights strung across the top in three swags
const swags = [[0, 400], [400, 800], [800, 1200]]
const bulbs = ['#D7263D', '#F6D776', '#2F80ED', '#4CAF50', '#FF8A3D']
const lights = swags.map(([a, b], s) => {
  const mid = (a + b) / 2, sag = 70
  const wire = `<path d="M${a} 18 Q${mid} ${18 + sag * 2} ${b} 18" fill="none" stroke="${ink}" stroke-width="3"/>`
  const pts = Array.from({ length: 9 }).map((_, i) => { const t = (i + 0.5) / 9, x = a + (b - a) * t, y = 18 + 2 * t * (1 - t) * sag * 2; const c = bulbs[(i + s) % bulbs.length]; return `<circle cx="${x}" cy="${y + 10}" r="16" fill="${c}" opacity="0.25"/><ellipse cx="${x}" cy="${y + 10}" rx="7" ry="10" fill="${c}" stroke="${ink}" stroke-width="2.5"/><rect x="${x - 4}" y="${y - 1}" width="8" height="6" fill="#2B2B2B"/>` }).join('')
  return wire + pts
}).join('')
const words = `<text x="60" y="180" font-family="Georgia, 'Times New Roman', serif" font-size="78" font-style="italic" fill="#FFF8E1">Season’s greetings</text>
  <text x="64" y="232" font-family="Helvetica, Arial, sans-serif" font-size="26" letter-spacing="6" fill="#F6D776">FROM ALL OF US AT CAPITAL ROOMS</text>`

const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${sky}${stars}${moon}${skyline}${tree}${ground}${snow}${lights}${words}</svg>`

// the holly garland: leaves and berries along a cream strip
const HW = 1200, HH = 110
const leaf = (x, y, r, c) => `<path transform="rotate(${r} ${x} ${y})" d="M${x - 42} ${y} q 10 -14 18 -6 q 8 -14 18 -4 q 8 -12 18 -2 q 8 -10 16 2 q -8 12 -16 4 q -10 10 -18 0 q -10 10 -18 0 q -8 8 -18 6 Z" fill="${c}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`
const holly = `<svg xmlns="http://www.w3.org/2000/svg" width="${HW}" height="${HH}" viewBox="0 0 ${HW} ${HH}"><rect width="${HW}" height="${HH}" fill="#FFFFFF"/>
  <path d="M0 55 Q150 30 300 55 T600 55 T900 55 T1200 55" fill="none" stroke="#1F6B3F" stroke-width="6"/>
  ${Array.from({ length: 12 }).map((_, i) => { const x = 50 + i * 100, y = 55 + (i % 2 ? 6 : -6); return leaf(x - 20, y, -20, i % 2 ? '#1F6B3F' : '#2E8B57') + leaf(x + 22, y + 4, 25, i % 2 ? '#2E8B57' : '#1F6B3F') + [[-6, -2], [6, -4], [0, 8]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="7" fill="#D7263D" stroke="${ink}" stroke-width="2.5"/>`).join('') }).join('')}</svg>`

fs.mkdirSync('public/email/themes', { recursive: true })
await sharp(Buffer.from(header)).png({ compressionLevel: 9 }).toFile('public/email/themes/christmas-header.png')
await sharp(Buffer.from(holly)).png({ compressionLevel: 9 }).toFile('public/email/themes/christmas-holly.png')
console.log('done')
