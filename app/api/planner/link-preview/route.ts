// GET /api/planner/link-preview?url= → { image, title } from a shop/product page's own preview tags (og:image), so an
// item with a product link and no photos still shows the picture on the Photo board (17 Nov 2026). Planner people only.
import { NextRequest, NextResponse } from 'next/server'
import { plannerCaller } from '@/lib/planner/caller'

export const dynamic = 'force-dynamic'
const tag = (html: string, p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']+)`, 'i'))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${p}["']`, 'i'))?.[1]

export async function GET(req: NextRequest) {
  if (!(await plannerCaller(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const u = req.nextUrl.searchParams.get('url') ?? ''
  let url: URL
  try { url = new URL(u) } catch { return NextResponse.json({ image: null }) }
  if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) return NextResponse.json({ image: null })
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; link preview)', Accept: 'text/html' }, signal: AbortSignal.timeout(6000), redirect: 'follow' })
    const html = (await r.text()).slice(0, 400_000)
    let image = tag(html, 'og:image') ?? tag(html, 'twitter:image') ?? null
    if (image) image = new URL(image.replace(/&amp;/g, '&'), url).toString()
    const title = tag(html, 'og:title') ?? html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() ?? null
    return NextResponse.json({ image, title }, { headers: { 'Cache-Control': 'private, max-age=86400' } })
  } catch { return NextResponse.json({ image: null }) }
}
