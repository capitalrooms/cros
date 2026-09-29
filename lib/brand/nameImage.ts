// Measures a name set in the house font (Space Grotesk Bold, spaced capitals) — shared by the
// name-image route and the email footer so the <img> is always sized to the exact image.
import fs from 'fs'
import path from 'path'
import * as fontkit from 'fontkit'

export const NAME_SCALE = 3
export const NAME_SIZE = 19        // display px
export const NAME_TRACK = 0.08     // em
export const NAME_PAD = 3          // px at 3×
export const NAME_OK = /^[A-Z0-9 &'.,\-]{1,48}$/

let fontData: Buffer | null = null
let font: any = null // eslint-disable-line @typescript-eslint/no-explicit-any

export function houseFont() {
  if (!fontData) {
    fontData = fs.readFileSync(path.join(process.cwd(), 'lib/brand/fonts/SpaceGrotesk-Bold.ttf'))
    font = fontkit.create(fontData)
  }
  return { data: fontData, font }
}

export const normaliseName = (name: string) => name.trim().toUpperCase().replace(/\s+/g, ' ')

/** Size of the name image in 3× pixels plus the text metrics needed to draw it. */
export function measureName(name: string) {
  const { font: f } = houseFont()
  const px = NAME_SIZE * NAME_SCALE
  const em = (v: number) => (v / f.unitsPerEm) * px
  const track = NAME_TRACK * px
  const textW = em(f.layout(name).advanceWidth) + track * (name.length - 1)
  const asc = em(f.ascent), desc = em(-f.descent), cap = em(f.capHeight)
  return {
    px, track, asc, desc, cap,
    width: Math.ceil(textW + NAME_PAD * 2),
    height: Math.ceil(cap + NAME_PAD * 2),
  }
}

/** Display width (1×) of a name image — what the <img width> should be. */
export function nameDisplayWidth(name: string): number {
  const n = normaliseName(name)
  if (!NAME_OK.test(n)) return 0          // not drawable — the signature falls back to plain text
  try { return Math.round(measureName(n).width / NAME_SCALE) } catch { return 0 }
}
