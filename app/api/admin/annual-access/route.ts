/**
 * GET /api/admin/annual-access — what the signed-in office user may see of the annual financial reports, and whether
 * they are the owner (19 Nov 2026). Used only to hide navigation links. Every annual route checks the same flag on the
 * server (lib/adminAuth requireAnnual), so this can't grant anything by itself.
 */
import { NextRequest, NextResponse } from 'next/server'
import { officeCaller, bearer } from '@/lib/access/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const who = await officeCaller(bearer(req.headers))
  if (!who) return NextResponse.json({ annual: false, owner: false }, { status: 401 })
  return NextResponse.json({ annual: who.annual, owner: who.isOwner })
}
