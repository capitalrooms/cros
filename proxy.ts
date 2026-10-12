// The gatekeeper in front of the app (Next 16 "proxy", formerly middleware.ts). 12 Oct 2026, access levels:
// every office API request (/api/admin/*) must come from a signed-in office person whose access includes the area
// that route belongs to (lib/access/areas — administrators have every area; routes in no area are administrators
// only). The route's own check still runs after this one. Pages aren't checked here — the office layout hides and
// blocks them — because a page shows nothing without its API calls, which are.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { officeCaller, bearer } from '@/lib/access/server'
import { canCallApi, isPublicApi } from '@/lib/access/areas'

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
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
  matcher: ['/api/admin/:path*'],
}
