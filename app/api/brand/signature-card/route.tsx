/**
 * GET /api/brand/signature-card?d=…&s=… — the reply signature drawn as one picture (lib/brand/signatureCard), so no
 * mail app can split, edit or re-font it. Public on purpose (mail apps fetch it with no login); only links sealed by
 * the server are drawn. Drawn at 2× for sharp phones; 480 × 84 on the page.
 */
import fs from 'fs'
import path from 'path'
import { ImageResponse } from 'next/og'
import { houseFont } from '@/lib/brand/nameImage'
import { readSignatureCard } from '@/lib/brand/signatureCard'

export const runtime = 'nodejs'
const W = 480, H = 84
const X = 2

let lato: Buffer | null = null, disc: string | null = null
function assets() {
  if (!lato) lato = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Lato-Regular.ttf'))
  if (!disc) disc = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'public/brand/disc-small.png')).toString('base64')}`
  return { lato, disc }
}
const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const p = readSignatureCard(searchParams.get('d'), searchParams.get('s'))
  if (!p) return new Response('Not found', { status: 404 })
  const { lato, disc } = assets()
  const { data: grotesk } = houseFont()
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: '#0d0d0d', borderRadius: 12 * X }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={disc} width={52 * X} height={52 * X} style={{ marginLeft: 14 * X, marginRight: 12 * X }} alt="" />
        <div style={{ width: X, height: 60 * X, background: '#262523', marginRight: 14 * X }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'Space Grotesk', fontSize: 16 * X, letterSpacing: 0.08 * 16 * X, color: '#f1efea', lineHeight: 1.15 }}>{p.name.toUpperCase()}</div>
          <div style={{ display: 'flex', fontFamily: 'Lato', fontSize: 12.5 * X, color: '#d6d3cd', marginTop: 5 * X }}>
            <span>{p.phone}</span><span style={{ color: '#4a4845', margin: `0 ${8 * X}px` }}>/</span><span>{p.email}</span>
          </div>
          <div style={{ fontFamily: 'Lato', fontSize: 12 * X, color: '#8d8a84', marginTop: 2 * X }}>capitalrooms.co.uk</div>
        </div>
      </div>
    ),
    {
      width: W * X, height: H * X,
      fonts: [
        { name: 'Space Grotesk', data: buf(grotesk!), weight: 700, style: 'normal' },
        { name: 'Lato', data: buf(lato), weight: 400, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=86400' },
    },
  )
}
