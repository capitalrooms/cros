// POST → the tenant's move-out email as HTML, exactly as it will be sent (lib/checkout/moveOut — room or whole-home
// version, chosen from the tenancy). Used by the Set On Notice modal's preview. It links to the tenant's online move-out form (4 Nov 2026).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { buildEmail } from '@/lib/emailWrapper'
import { moveOutEmail, prepareMoveOut } from '@/lib/checkout/moveOut'
import { moveOutUrl } from '@/lib/checkout/moveOutLink'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const d = await req.json().catch(() => null) as any
  if (!d?.moveOutDate || !d.tenancyId) return NextResponse.json({ error: 'Missing move-out details' }, { status: 400 })
  try {
    const m = await prepareMoveOut(createServiceClient(), { tenancyId: d.tenancyId, moveOutDate: d.moveOutDate, tenantName: d.tenantName, proRataAmount: d.proRataRent, proRataDays: d.proRataDays, roomName: d.roomName, propertyAddress: d.propertyAddress })
    const e = moveOutEmail({ ...m, formUrl: moveOutUrl(d.tenancyId) })
    return NextResponse.json({ html: await buildEmail(e.html, { kind: 'move-out', req }), subject: e.subject, attachment: null })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not build the email' }, { status: 500 })
  }
}
