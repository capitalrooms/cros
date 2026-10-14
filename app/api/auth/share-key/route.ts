// POST → give this signed-in staff device its "Share to CROS" key (lib/shareKey). Called by the admin app on load.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { isOfficeRole } from '@/lib/access/areas'
import { makeShareKey, SHARE_COOKIE } from '@/lib/shareKey'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const caller = await requireSignedIn(req)
  if (!caller || !isOfficeRole(caller.role)) return NextResponse.json({ ok: false }, { status: 401 })
  const { value, maxAge } = makeShareKey(caller.personId)
  const res = NextResponse.json({ ok: true })
  // SameSite=None: the phone's share sheet posts to us as a fresh navigation, which a Lax cookie would not join
  res.cookies.set(SHARE_COOKIE, value, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/share-target', maxAge })
  return res
}
