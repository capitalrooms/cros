// The picture for a Publish piece (13 Nov 2026): square for Instagram, wide for Facebook / LinkedIn / the website post
// cover and the email header. Laid out for whichever picture was chosen (lib/publish/pictures): the figures graphic in
// three looks, a London scene, an illustration, or one of our own property photos — always with the logo and headline.
// ?k=<picture key> previews a choice before it's saved. Public on purpose (social sites and mail apps fetch it with no
// login); it only ever shows the title, the opening line and official headline figures.
import fs from 'fs'
import path from 'path'
import { ImageResponse } from 'next/og'
import { createServiceClient } from '@/lib/supabase'
import { reportPacks } from '@/lib/rents/report'
import { LONDON } from '@/lib/publish'
import { LOOKS, parsePicture } from '@/lib/publish/pictures'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let font: Buffer | null = null
const logos: Record<string, string> = {}
// the logo as drawn (never typed out — the house rule), coloured for a dark or light background
const logo = (tone: 'paper' | 'ink') => (logos[tone] ??= dataUri(`publish/logo-${tone}.png`))
const gbp = (n: unknown) => n == null ? '—' : `£${Math.round(Number(n)).toLocaleString('en-GB')}`
const pct = (n: unknown) => n == null ? '—' : `${Number(n) > 0 ? '+' : ''}${Number(n).toFixed(1)}%`
const dataUri = (file: string) => `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'public', file)).toString('base64')}`

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })
  const s = createServiceClient()
  let { data: p } = await s.from('publications').select('kind, title, intro, areas, period, image').eq('id', id).maybeSingle() as { data: any; error: any }
  if (!p) { const r = await s.from('publications').select('kind, title, intro, areas, period').eq('id', id).maybeSingle() as { data: any }; p = r.data }
  if (!p) return new Response('Not found', { status: 404 })
  const url = new URL(req.url)
  const pic = parsePicture(url.searchParams.get('k') ?? p.image)
  if (!font) font = fs.readFileSync(path.join(process.cwd(), 'lib/brand/fonts/Geist-Regular.ttf'))
  const square = url.searchParams.get('size') !== 'wide'
  const W = square ? 1080 : 1200, H = square ? 1080 : 630
  const pk = p.kind === 'market_update' ? (await reportPacks(s, p.areas?.length ? p.areas : [LONDON]))[0] : null
  const month = p.period ? new Date(`${p.period}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const stats: [string, string][] = pk ? [['Average rent', `${gbp(pk.rents.rent_all)}/mo`], ['Rents on a year', pct(pk.rents.change_all)], ['Prices on a year', pct(pk.sales?.change12)]] : []
  const title = String(p.title).replace(/ — .*$/, '')
  const kicker = p.kind === 'market_update' ? `MARKET UPDATE${month ? ` · ${month.toUpperCase()}` : ''}` : 'NEWS'

  // the picture behind / beside the words
  let art: string | null = null
  if (pic.kind === 'scene') art = dataUri(`email/insight/${pic.key}.png`)
  if (pic.kind === 'illus') art = dataUri(`publish/illustrations/${pic.key}.png`)
  if (pic.kind === 'photo') {
    const { data: ph } = await s.from('property_photos').select('file_url, file_path').eq('id', pic.key).maybeSingle() as { data: any }
    art = ph ? (ph.file_url || s.storage.from('property-photos').getPublicUrl(String(ph.file_path)).data.publicUrl) : null
  }
  const look = LOOKS[(pic.kind === 'figures' ? pic.key : 'dark') as keyof typeof LOOKS] ?? LOOKS.dark
  const forest = '#1F3B2E', gold = '#C9A227', paper = '#F3F0E6'

  const brand = (ink: string, accent: string, size = 1) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo(ink === '#1B1A17' ? 'ink' : 'paper')} height={88 * size} width={Math.round(88 * size * 1.072)} alt="Capital Rooms" />
      <span style={{ fontSize: 19 * size, letterSpacing: 4, color: accent, borderLeft: `2px solid ${accent}`, paddingLeft: 20 }}>{kicker}</span>
    </div>
  )
  const tiles = (ink: string, accent: string, tile: string, big: number) => stats.length > 0 && (
    <div style={{ display: 'flex', gap: 18 }}>
      {stats.map(([k, v]) => (
        <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: tile, borderRadius: 22, padding: '18px 22px' }}>
          <span style={{ fontSize: big * 0.42, color: ink, opacity: 0.75 }}>{k}</span>
          <span style={{ fontSize: v.length > 9 ? big * 0.82 : big, whiteSpace: 'nowrap', color: v.startsWith('-') ? '#E4573D' : accent }}>{v}</span>
        </div>
      ))}
    </div>
  )

  let body: React.ReactElement
  if (!art) {
    // the figures graphic
    body = (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: look.bg, color: look.ink, padding: square ? 80 : 60 }}>
        {brand(look.ink, look.accent, square ? 1.15 : 1)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span style={{ fontSize: square ? 76 : 58, lineHeight: 1.05 }}>{title}</span>
          {!pk && p.intro && <span style={{ fontSize: square ? 34 : 26, lineHeight: 1.3, opacity: 0.85 }}>{String(p.intro).slice(0, 160)}</span>}
        </div>
        {tiles(look.ink, look.accent, look.tile, square ? 50 : 38) || <span style={{ fontSize: 22, opacity: 0.7 }}>capitalrooms.co.uk</span>}
      </div>
    )
  } else if (pic.kind === 'photo') {
    // our own photo, full bleed, darkened at the bottom for the words
    body = (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: forest }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', background: 'linear-gradient(180deg, rgba(31,59,46,0.55) 0%, rgba(31,59,46,0) 30%, rgba(31,59,46,0) 45%, rgba(31,59,46,0.92) 78%)' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: square ? 70 : 52, color: paper }}>
          {brand(paper, gold, square ? 1.1 : 0.95)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <span style={{ fontSize: square ? 70 : 50, lineHeight: 1.05 }}>{title}</span>
            {tiles(paper, gold, 'rgba(243,240,230,0.14)', square ? 44 : 32)}
          </div>
        </div>
      </div>
    )
  } else if (square) {
    // a scene or illustration on top, the words on green below
    const artH = pic.kind === 'scene' ? 432 : 560
    body = (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: forest, color: paper }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} width={W} height={artH} alt="" style={{ width: W, height: artH, objectFit: pic.kind === 'illus' ? 'contain' : 'cover', background: '#F3F0E6' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '44px 64px 56px' }}>
          {brand(paper, gold, 1)}
          <span style={{ fontSize: pic.kind === 'scene' ? 66 : 58, lineHeight: 1.05 }}>{title}</span>
          {tiles(paper, gold, 'rgba(243,240,230,0.08)', 40) || (p.intro ? <span style={{ fontSize: 28, opacity: 0.85 }}>{String(p.intro).slice(0, 120)}</span> : <span />)}
        </div>
      </div>
    )
  } else if (pic.kind === 'scene') {
    // wide scene: the skyline across the top, the words on green beneath
    body = (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: forest, color: paper }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} width={W} height={380} alt="" style={{ width: W, height: 380, objectFit: 'cover', objectPosition: 'center bottom' }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 56px', gap: 30 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 16, letterSpacing: 4, color: gold }}>{kicker}</span>
            <span style={{ fontSize: 46, lineHeight: 1.05 }}>{title}</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo('paper')} height={120} width={129} alt="Capital Rooms" />
        </div>
      </div>
    )
  } else {
    // wide illustration: the words on the left, the picture (whole) on the right
    body = (
      <div style={{ width: W, height: H, display: 'flex', background: forest, color: paper }}>
        <div style={{ width: 600, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 40px 48px 56px' }}>
          {brand(paper, gold, 0.85)}
          <span style={{ fontSize: 50, lineHeight: 1.06 }}>{title}</span>
          {stats.length ? <div style={{ display: 'flex', gap: 26 }}>{stats.slice(0, 2).map(([k, v]) => <div key={k} style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 18, opacity: 0.75 }}>{k}</span><span style={{ fontSize: 38, whiteSpace: 'nowrap', color: v.startsWith('-') ? '#F0A58F' : gold }}>{v}</span></div>)}</div> : <span style={{ fontSize: 20, opacity: 0.7 }}>capitalrooms.co.uk</span>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} width={600} height={H} alt="" style={{ width: 600, height: H, objectFit: 'contain', background: '#F3F0E6' }} />
      </div>
    )
  }
  return new ImageResponse(body, { width: W, height: H, fonts: [{ name: 'Geist', data: font, weight: 400 }] })
}
