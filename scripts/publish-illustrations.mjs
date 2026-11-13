// The illustrations for Publish (13 Nov 2026, Harry: "can we choose from a list of 10") — flat, in the house colours,
// drawn the same way as the London scenes (scripts/insight-scenes.mjs). Written as SVG, saved as square PNGs so every
// app and social site shows them. Run: node scripts/publish-illustrations.mjs → public/publish/illustrations/<key>.png
import sharp from 'sharp'
import fs from 'node:fs'

const S = 1080
const C = { paper: '#F3F0E6', cream: '#FBF8F0', forest: '#1F3B2E', moss: '#3E6B55', gold: '#C9A227', clay: '#D9762B', brick: '#B5543A', sky: '#CFE0E4', blue: '#8FA9B3', ink: '#1B1A17', white: '#FFFFFF', grey: '#D8D3C6' }
const sw = 6
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${/stroke=/.test(extra) ? '' : `stroke="${C.ink}"`} ${/stroke-width/.test(extra) ? '' : `stroke-width="${sw}"`} stroke-linejoin="round" stroke-linecap="round" ${extra}/>`
const R = (x, y, w, h, fill, r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${C.ink}" stroke-width="${sw}" stroke-linejoin="round"/>`
const Ci = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${C.ink}" stroke-width="${sw}"/>`
const L = (d, w = sw) => `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const ground = (y = 860) => `<rect x="0" y="${y}" width="${S}" height="${S - y}" fill="${C.grey}"/>${L(`M0 ${y} L${S} ${y}`)}`
const blob = (fill) => `<circle cx="540" cy="500" r="380" fill="${fill}"/>`
const wrap = (body, bg = C.paper) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="${bg}"/>${body}</svg>`

const ART = {
  // 1 — a front door, a key in the lock and a keyring
  keys: () => wrap(`${blob(C.sky)}${ground()}
    ${R(300, 220, 480, 640, C.cream)}${R(360, 270, 360, 590, C.forest, 6)}
    ${R(400, 320, 120, 220, C.moss, 4)}${R(560, 320, 120, 220, C.moss, 4)}${R(400, 590, 280, 120, C.moss, 4)}
    ${P('M340 220 Q540 120 740 220 Z', C.gold)}${Ci(645, 640, 16, C.gold)}
    ${Ci(700, 760, 70, 'none')}${P('M700 690 L700 610 L730 610 L730 630 L712 630 L712 650 L730 650 L730 670 L712 670 L712 690', C.gold)}
    ${R(250, 300, 30, 60, C.gold, 6)}${R(800, 300, 30, 60, C.gold, 6)}${R(330, 860, 420, 20, C.grey)}`),
  // 2 — a row of London terraces
  terraces: () => wrap(`${blob('#E6D9C3')}${ground(880)}
    ${[0, 1, 2, 3].map(i => { const x = 90 + i * 225, c = [C.brick, C.cream, '#C98B6B', C.moss][i]; return `${R(x, 360, 225, 520, c)}${P(`M${x - 10} 360 L${x + 112} 270 L${x + 235} 360 Z`, C.forest)}${R(x + 140, 290, 30, 50, C.brick)}${R(x + 40, 420, 60, 90, C.sky, 4)}${R(x + 125, 420, 60, 90, C.sky, 4)}${R(x + 40, 560, 60, 90, C.sky, 4)}${R(x + 125, 560, 60, 110, C.forest, 30)}${R(x + 30, 700, 165, 20, C.grey)}` }).join('')}
    ${L('M90 520 L990 520', 4)}`),
  // 3 — rents rising: bars and an arrow over a little skyline
  chart: () => wrap(`${blob(C.sky)}
    ${[[200, 600], [340, 520], [480, 430], [620, 330], [760, 230]].map(([x, y], i) => R(x, y, 110, 820 - y, [C.moss, C.moss, C.forest, C.forest, C.gold][i], 8)).join('')}
    ${L('M180 820 L900 820', 8)}${P('M200 560 L380 470 L520 380 L700 260 L820 170', 'none', 'stroke-width="12"')}${P('M790 150 L860 150 L840 220 Z', C.clay)}
    ${[[230, 870], [330, 860], [430, 875], [530, 850], [640, 865], [760, 858], [860, 872]].map(([x, y]) => R(x, y, 60, S - y, C.grey)).join('')}`),
  // 4 — new rules: a calendar page and a gavel
  calendar: () => wrap(`${blob('#E6D9C3')}
    ${R(220, 230, 520, 560, C.white, 24)}${R(220, 230, 520, 120, C.brick, 24)}${R(220, 320, 520, 30, C.brick)}
    ${Ci(320, 230, 22, C.grey)}${Ci(640, 230, 22, C.grey)}
    ${[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4].map(c => R(260 + c * 92, 390 + r * 92, 66, 66, r === 1 && c === 2 ? C.gold : C.cream, 8)).join('')).join('')}
    <g transform="rotate(-35 760 700)">${R(660, 640, 240, 90, C.clay, 14)}${R(760, 730, 40, 230, C.forest, 10)}</g>${R(640, 870, 300, 36, C.forest, 10)}`),
  // 5 — maintenance: a toolbox, a spanner and a screwdriver
  toolbox: () => wrap(`${blob(C.sky)}${ground(840)}
    ${R(250, 520, 580, 320, C.brick, 20)}${R(250, 520, 580, 90, C.clay, 20)}${P('M430 520 L430 440 Q540 390 650 440 L650 520', 'none', 'stroke-width="18"')}${R(500, 580, 80, 50, C.gold, 8)}
    <g transform="rotate(-30 540 330)">${R(380, 300, 320, 46, C.blue, 20)}${Ci(380, 323, 46, C.blue)}${Ci(380, 323, 18, C.paper)}</g>
    <g transform="rotate(25 760 330)">${R(700, 230, 46, 170, C.gold, 14)}${R(712, 400, 22, 150, C.grey, 6)}</g>`),
  // 6 — moving in: boxes and a plant
  moving: () => wrap(`${blob('#E6D9C3')}${ground(860)}
    ${R(200, 560, 340, 300, '#C79A63')}${L('M200 640 L540 640')}${R(330, 560, 80, 80, '#B98A52')}
    ${R(560, 640, 300, 220, '#C79A63')}${L('M560 710 L860 710')}${R(680, 640, 60, 70, '#B98A52')}
    ${R(280, 360, 260, 200, '#D4AE7C')}${L('M280 420 L540 420')}
    ${R(640, 520, 120, 120, C.clay, 10)}${P('M700 520 C 640 440 600 420 620 360 C 660 400 690 440 700 520 C 710 430 740 380 790 360 C 790 430 760 470 700 520', C.moss)}`),
  // 7 — an inspection: a magnifying glass over a house
  inspection: () => wrap(`${blob(C.sky)}${ground(860)}
    ${R(270, 460, 420, 400, C.cream)}${P('M240 470 L480 280 L720 470 Z', C.brick)}${R(440, 660, 90, 200, C.forest, 6)}${R(320, 540, 90, 90, C.sky, 4)}${R(560, 540, 90, 90, C.sky, 4)}
    ${Ci(700, 520, 150, 'rgba(207,224,228,0.55)')}${Ci(700, 520, 150, 'none')}${P('M806 626 L930 750 L900 780 L776 656 Z', C.forest)}
    ${P('M640 520 L690 570 L780 470', 'none', 'stroke="#1F3B2E" stroke-width="18"')}`),
  // 8 — rent and money: coins and a pound sign
  pounds: () => wrap(`${blob('#E6D9C3')}${ground(870)}
    ${[0, 1, 2, 3, 4, 5].map(i => `<ellipse cx="330" cy="${830 - i * 52}" rx="130" ry="40" fill="${C.gold}" stroke="${C.ink}" stroke-width="${sw}"/>`).join('')}
    ${[0, 1, 2, 3].map(i => `<ellipse cx="620" cy="${830 - i * 52}" rx="130" ry="40" fill="${C.gold}" stroke="${C.ink}" stroke-width="${sw}"/>`).join('')}
    ${Ci(700, 360, 170, C.forest)}<text x="700" y="425" font-family="Georgia, serif" font-size="200" font-weight="700" fill="${C.gold}" text-anchor="middle">£</text>`),
  // 9 — signing: an agreement, a pen and a signature
  signing: () => wrap(`${blob(C.sky)}
    <g transform="rotate(-6 540 540)">${R(270, 200, 520, 680, C.white, 16)}${[0, 1, 2, 3, 4, 5].map(i => L(`M330 ${300 + i * 60} L${i % 2 ? 640 : 720} ${300 + i * 60}`, 8)).join('')}${L('M330 760 L620 760', 6)}${P('M340 740 C 380 680 400 760 440 700 C 470 660 480 760 530 720 C 560 700 580 730 600 720', 'none', 'stroke="#1F3B2E" stroke-width="8"')}</g>
    <g transform="rotate(35 760 640)">${R(720, 420, 60, 360, C.forest, 18)}${P('M720 780 L750 860 L780 780 Z', C.gold)}${R(720, 420, 60, 60, C.gold, 18)}</g>`),
  // 10 — where: a map pin on London streets and the river
  map: () => wrap(`${R(120, 160, 840, 760, C.cream, 30)}
    ${P('M120 640 C 300 560 420 720 600 620 C 760 530 860 640 960 590 L960 700 C 860 750 760 640 600 730 C 420 830 300 670 120 750 Z', C.sky)}
    ${L('M260 160 L320 920', 10)}${L('M120 380 L960 300', 10)}${L('M620 160 L700 920', 10)}${L('M120 520 L960 470', 6)}
    ${R(380, 400, 160, 120, '#E6D9C3', 6)}${R(720, 330, 140, 120, '#E6D9C3', 6)}${R(170, 800, 140, 90, '#E6D9C3', 6)}
    ${P('M540 560 C 410 400 410 230 540 210 C 670 230 670 400 540 560 Z', C.clay)}${Ci(540, 330, 50, C.paper)}`),
}
export const KEYS = Object.keys(ART)
fs.mkdirSync('public/publish/illustrations', { recursive: true })
for (const k of KEYS) await sharp(Buffer.from(ART[k]())).png({ compressionLevel: 9 }).toFile(`public/publish/illustrations/${k}.png`)
console.log('done', fs.readdirSync('public/publish/illustrations'))
