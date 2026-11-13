// The picture for a Publish piece (13 Nov 2026): square for Instagram, wide for Facebook and the website post's cover.
// Public on purpose (social sites and mail apps fetch it with no login) — it only ever shows the published headline
// figures (official rents and prices) and the title. lib/publish.
import fs from 'fs'
import path from 'path'
import { ImageResponse } from 'next/og'
import { createServiceClient } from '@/lib/supabase'
import { reportPacks } from '@/lib/rents/report'
import { LONDON } from '@/lib/publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let font: Buffer | null = null, disc = ''
const gbp = (n: unknown) => n == null ? '—' : `£${Math.round(Number(n)).toLocaleString('en-GB')}`
const pct = (n: unknown) => n == null ? '—' : `${Number(n) > 0 ? '+' : ''}${Number(n).toFixed(1)}%`

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })
  const s = createServiceClient()
  const { data: p } = await s.from('publications').select('kind, title, intro, areas, period').eq('id', id).maybeSingle() as { data: any }
  if (!p) return new Response('Not found', { status: 404 })
  if (!font) font = fs.readFileSync(path.join(process.cwd(), 'lib/brand/fonts/Geist-Regular.ttf'))
  if (!disc) disc = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'lib/brand/fonts/disc-small.png')).toString('base64')}`
  const square = new URL(req.url).searchParams.get('size') !== 'wide'
  const W = square ? 1080 : 1200, H = square ? 1080 : 630
  const pk = p.kind === 'market_update' ? (await reportPacks(s, p.areas?.length ? p.areas : [LONDON]))[0] : null
  const month = p.period ? new Date(`${p.period}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const stats: [string, string][] = pk ? [['Average rent', `${gbp(pk.rents.rent_all)}/mo`], ['Rents on a year', pct(pk.rents.change_all)], ['Prices on a year', pct(pk.sales?.change12)]] : []
  const forest = '#1F3B2E', gold = '#C9A227', paper = '#F3F0E6'
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: forest, color: paper, padding: square ? 80 : 64, fontFamily: 'Geist' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={disc} width={square ? 72 : 60} height={square ? 72 : 60} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: square ? 30 : 26, letterSpacing: 6 }}>CAPITAL ROOMS</span>
            <span style={{ fontSize: square ? 22 : 20, color: gold, letterSpacing: 4 }}>{p.kind === 'market_update' ? `MARKET UPDATE${month ? ` · ${month.toUpperCase()}` : ''}` : 'NEWS'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span style={{ fontSize: square ? 76 : 58, lineHeight: 1.05, fontWeight: 700 }}>{String(p.title).replace(/ — .*$/, '')}</span>
          {!pk && p.intro && <span style={{ fontSize: square ? 36 : 28, lineHeight: 1.3, opacity: 0.85 }}>{String(p.intro).slice(0, 160)}</span>}
        </div>
        {stats.length > 0 ? (
          <div style={{ display: 'flex', gap: square ? 24 : 20 }}>
            {stats.map(([k, v]) => (
              <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(243,240,230,0.08)', borderRadius: 24, padding: square ? 28 : 22 }}>
                <span style={{ fontSize: square ? 22 : 18, opacity: 0.75 }}>{k}</span>
                <span style={{ fontSize: square ? 52 : 40, color: v.startsWith('-') ? '#F0A58F' : gold }}>{v}</span>
              </div>
            ))}
          </div>
        ) : <span style={{ fontSize: 24, opacity: 0.7 }}>capitalrooms.co.uk</span>}
        {pk && <span style={{ fontSize: square ? 18 : 15, opacity: 0.6 }}>Source: ONS and HM Land Registry · capitalrooms.co.uk</span>}
      </div>
    ),
    { width: W, height: H, fonts: [{ name: 'Geist', data: font, weight: 400 }] },
  )
}
