// The gatekeeper in front of the app (Next 16 "proxy", formerly middleware.ts).
//
// 1. The public website (9 Nov 2026). Requests to capitalrooms.co.uk are the website: they're sent to the pages under
//    app/site, and they can reach NOTHING else — no CROS screen, no office API. Only the website's pages, the public
//    files, listing pages (/l/…) and the website's own enquiry form. The app keeps its own address for now.
//    /site/… on the app's address is the private preview of the website before the domain moves.
// 2. Office APIs (12 Oct 2026, access levels): every /api/admin request must come from a signed-in office person whose
//    access includes the area that route belongs to (lib/access/areas). The route's own check still runs after this.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { officeCaller, bearer } from '@/lib/access/server'
import { canCallApi, isPublicApi } from '@/lib/access/areas'

const SITE_HOSTS = new Set(['capitalrooms.co.uk', 'www.capitalrooms.co.uk'])
const APP_ORIGIN = 'https://cros-sigma.vercel.app'
// what the website address may serve as it is (everything else is a website page, or nothing)
const SITE_PASS = [/^\/_next\//, /^\/website\//, /^\/brand\//, /^\/fonts\//, /^\/l\//, /^\/api\/site\//, /^\/api\/listing\//, /^\/(favicon-32|apple-touch-icon|icon-\d+|logo)\.png$/, /^\/robots\.txt$/, /^\/sitemap\.xml$/]
// the app's sign-in and screens: sent to the app's own address
const APP_PATHS = /^\/(login|admin|tenant|landlord|lettings|contractor|cleaner|agent|account|dashboard|auth|pack|proposal|lu|reset-password|install)(\/|$)/

function siteHeaders(request: NextRequest) {
  const h = new Headers(request.headers)
  h.set('x-cr-site', '1')
  return h
}

// browsers only ever use https for the website, for two years (the app's headers in next.config cover the rest)
function secure(res: NextResponse) { res.headers.set('Strict-Transport-Security', 'max-age=63072000'); return res }

export async function proxy(request: NextRequest) {
  const url = request.nextUrl
  const path = url.pathname
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]

  if (SITE_HOSTS.has(host)) {
    // one address: www goes to the plain domain
    if (host.startsWith('www.')) { const to = new URL(url.toString()); to.host = 'capitalrooms.co.uk'; to.port = ''; return NextResponse.redirect(to, 308) }
    if (APP_PATHS.test(path)) return NextResponse.redirect(`${APP_ORIGIN}${path}${url.search}`, 307)
    if (SITE_PASS.some(r => r.test(path))) return secure(NextResponse.next({ request: { headers: siteHeaders(request) } }))
    if (path.startsWith('/api/') || path.startsWith('/site')) return new NextResponse('Not found', { status: 404 })
    const to = url.clone(); to.pathname = path === '/' ? '/site' : `/site${path}`
    return secure(NextResponse.rewrite(to, { request: { headers: siteHeaders(request) } }))
  }

  // the private preview of the website on the app's address
  if (path === '/site' || path.startsWith('/site/')) {
    const res = NextResponse.next({ request: { headers: siteHeaders(request) } })
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')   // the preview never shows up in Google
    return res
  }

  if ((path === '/api/admin' || path.startsWith('/api/admin/')) && !isPublicApi(path)) {
    const who = await officeCaller(bearer(request.headers))
    if (!who) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    if (!canCallApi(path, who.areas, who.role, request.method)) {
      return NextResponse.json({ error: 'That isn’t part of your access. Ask an administrator if you need it.' }, { status: 403 })
    }
  }
  return NextResponse.next()
}

export const config = {
  // every page and API (the website is decided by the address); never the build's static files
  matcher: ['/((?!_next/static|_next/image).*)'],
}
