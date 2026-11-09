// The gatekeeper in front of the app (Next 16 "proxy", formerly middleware.ts).
//
// 1. One address (9 Nov 2026, Harry: "I don't see the point in having two domains"). capitalrooms.co.uk is both the
//    website and the app: the website's pages (app/site — the old site's addresses, and listings at /l/…) are sent to
//    the website; everything else is the app as before (sign-in, the office, tenants, landlords…). The old app address
//    (cros-sigma / cros-capital-rooms .vercel.app) forwards people's pages to capitalrooms.co.uk; its /api stays, so
//    webhooks and scheduled jobs registered there keep working.
// 2. Office APIs (12 Oct 2026, access levels): every /api/admin request must come from a signed-in office person whose
//    access includes the area that route belongs to (lib/access/areas). The route's own check still runs after this.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { officeCaller, bearer } from '@/lib/access/server'
import { canCallApi, isPublicApi } from '@/lib/access/areas'

const SITE = 'capitalrooms.co.uk'
const OLD_APP_HOSTS = new Set(['cros-sigma.vercel.app', 'cros-capital-rooms.vercel.app'])
// the website's own pages (everything else on the domain is the app)
const SITE_PAGES = /^\/$|^\/(landlords|tenants|about-us|contact|maintenance-services|instant_valuation|testimonial|blogs|residential-lettings|shared-accommodation|privacy_policy|user_blog|areas)(\/|$)|^\/page\/[\w-]+$|^\/l\/[\w-]+\/[\w-]+$/

// browsers only ever use https for the website, for two years (the app's headers in next.config cover the rest)
function secure(res: NextResponse) { res.headers.set('Strict-Transport-Security', 'max-age=63072000'); return res }
function siteHeaders(request: NextRequest) { const h = new Headers(request.headers); h.set('x-cr-site', '1'); return h }

export async function proxy(request: NextRequest) {
  const url = request.nextUrl
  const path = url.pathname
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]

  if (host === `www.${SITE}`) return NextResponse.redirect(`https://${SITE}${path}${url.search}`, 308)
  // the old app address: people's pages move to the one domain; its API stays (webhooks, cron, the deploy check)
  if (OLD_APP_HOSTS.has(host) && !path.startsWith('/api/') && !path.startsWith('/_next/')) {
    // the old address's front page was the app's front door (phones that installed it there start at '/')
    return NextResponse.redirect(`https://${SITE}${path === '/' ? '/app' : path === '/site' ? '/' : path.replace(/^\/site(?=\/)/, '')}${url.search}`, 308)
  }

  if (host === SITE) {
    if (path === '/site' || path.startsWith('/site/')) return new NextResponse('Not found', { status: 404 })
    if (SITE_PAGES.test(path)) {
      const to = url.clone(); to.pathname = path === '/' ? '/site' : `/site${path}`
      return secure(NextResponse.rewrite(to, { request: { headers: siteHeaders(request) } }))
    }
  } else if (path === '/site' || path.startsWith('/site/')) {
    // the website on any other address (local development, preview builds) — never indexed
    const res = NextResponse.next({ request: { headers: siteHeaders(request) } })
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }

  if ((path === '/api/admin' || path.startsWith('/api/admin/')) && !isPublicApi(path)) {
    const who = await officeCaller(bearer(request.headers))
    if (!who) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    if (!canCallApi(path, who.areas, who.role, request.method)) {
      return NextResponse.json({ error: 'That isn’t part of your access. Ask an administrator if you need it.' }, { status: 403 })
    }
  }
  return host === SITE ? secure(NextResponse.next()) : NextResponse.next()
}

export const config = {
  // every page and API (the website is decided by the address); never the build's static files
  matcher: ['/((?!_next/static|_next/image).*)'],
}
