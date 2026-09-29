/**
 * GET /api/brand/signature-name?n=HARRY%20BUCHANAN&t=light|ink[&meta=1]
 *
 * A person's name drawn in the house font (Space Grotesk Bold, spaced capitals) as a PNG at 3×,
 * for email signatures and email footers — email apps ignore web fonts, so the name travels as an image.
 * Public on purpose (Gmail fetches it with no login) and cached for a year; only short plain names allowed.
 * meta=1 → { width, height } in display pixels, for building the <img> tag.
 */
import { ImageResponse } from 'next/og'
import { houseFont, measureName, normaliseName, NAME_OK, NAME_PAD, NAME_SCALE } from '@/lib/brand/nameImage'

export const runtime = 'nodejs'

const CACHE = { 'Cache-Control': 'public, max-age=31536000, immutable' }

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = normaliseName(searchParams.get('n') ?? '')
  if (!NAME_OK.test(name)) return new Response('Name must be 1–48 letters, numbers or & \' . , -', { status: 400 })
  const color = searchParams.get('t') === 'ink' ? '#1a1a1a' : '#f1efea'
  const m = measureName(name)

  if (searchParams.get('meta')) {
    return Response.json({ width: Math.round(m.width / NAME_SCALE), height: Math.round(m.height / NAME_SCALE) }, { headers: CACHE })
  }

  const { data } = houseFont()
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: NAME_PAD, top: NAME_PAD - (m.asc - m.cap),
          fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: m.px, lineHeight: `${m.asc + m.desc}px`,
          letterSpacing: m.track, color, whiteSpace: 'nowrap', display: 'flex',
        }}>{name}</div>
      </div>
    ),
    {
      width: m.width, height: m.height,
      fonts: [{ name: 'Space Grotesk', data: data!.buffer.slice(data!.byteOffset, data!.byteOffset + data!.byteLength) as ArrayBuffer, weight: 700, style: 'normal' }],
      headers: CACHE,
    },
  )
}
