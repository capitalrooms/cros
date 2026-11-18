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
    // many shops turn away anything that doesn't look like a browser — so ask like one (17 Nov 2026: "some links pull
    // photos in and some don't")
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-GB,en;q=0.9' }, signal: AbortSignal.timeout(8000), redirect: 'follow' })
    const html = (await r.text()).slice(0, 1_500_000)
    // the shop's own sharing picture, then its product data, then the page's main product image
    const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join(' ')
    const ldImg = ld.match(/"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"([^"]+\.(?:jpe?g|png|webp|avif)[^"]*)"/i)?.[1] ?? ld.match(/"image"\s*:\s*(?:\[\s*)?"(https?:[^"]+)"/i)?.[1]
    let image = tag(html, 'og:image') ?? tag(html, 'og:image:secure_url') ?? tag(html, 'twitter:image') ?? tag(html, 'twitter:image:src') ?? ldImg
      ?? html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)/i)?.[1]
      ?? html.match(/itemprop=["']image["'][^>]*(?:content|src)=["']([^"']+)/i)?.[1]
      ?? html.match(/<img[^>]+(?:id|class)=["'][^"']*(?:product|main|hero|primary|landingImage)[^"']*["'][^>]*src=["'](https?:[^"']+)/i)?.[1]
      ?? null
    if (image) image = image.replace(/\\u002F/g, '/').replace(/\\\//g, '/')
    if (image) image = new URL(image.replace(/&amp;/g, '&'), url).toString()
    const title = tag(html, 'og:title') ?? html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() ?? null
    return NextResponse.json({ image, title }, { headers: { 'Cache-Control': 'private, max-age=86400' } })
  } catch { return NextResponse.json({ image: null }) }
}
