// The "Sort out" panel for a tenant's rent (lib/rent/resolve). Finance area (lib/access/areas).
// GET  ?tenancy=ID           → { position, message } — what's owed, payments, plans, what was said; the tenant message preview
// POST { tenancy, action, … } → do one fix:
//   tell        { email, text, extra }               reverse { key, reason }
//   refund      { chargeId, amount, reason }         direct  { chargeId, amount, date, note, takeFee }
//   reduce      { chargeId, newDue, reason }          plan    { instalment, startsOn, note }
//   end_plan    { planId, outcome, note }
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { getElectedCommsLive } from '@/lib/comms'
import { rentPosition, tenantMessage, tellTenant, reverseReceipt, refundOver, paidDirect, reduceDue, agreePlan, endPlan } from '@/lib/rent/resolve'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'That isn’t part of your access.' }, { status: 403 })
  const tenancy = req.nextUrl.searchParams.get('tenancy')
  if (!tenancy) return NextResponse.json({ error: 'Which tenancy?' }, { status: 400 })
  try {
    const s = createServiceClient()
    const position = await rentPosition(s, tenancy)
    const t: any = position.tenancy
    return NextResponse.json({
      position: { ...position, tenancy: { id: t.id, tenant: [t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ') || t.people?.full_name, email: t.people?.email ?? null, phone: t.people?.phone ?? null, room: t.rooms?.name, property: String(t.properties?.name || '').split('\n')[0], reference: t.payment_reference, rent: Number(t.rent_amount) } },
      message: position.owed > 0.005 ? tenantMessage(position) : null,
      commsLive: await getElectedCommsLive(),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'That isn’t part of your access.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const tenancy = String(b.tenancy ?? '')
  if (!tenancy) return NextResponse.json({ error: 'Which tenancy?' }, { status: 400 })
  const by = { personId: me.personId, email: me.email }
  const s = createServiceClient()
  try {
    switch (b.action) {
      case 'tell':
        if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages you choose to send are paused (Settings) — nothing was sent.' }, { status: 409 })
        return NextResponse.json(await tellTenant(s, tenancy, { email: !!b.email, text: !!b.text, extra: String(b.extra ?? '').slice(0, 600), by, req }))
      case 'reverse': return NextResponse.json(await reverseReceipt(s, tenancy, String(b.key ?? ''), String(b.reason ?? ''), by))
      case 'refund': return NextResponse.json(await refundOver(s, tenancy, String(b.chargeId ?? ''), Number(b.amount), String(b.reason ?? ''), by))
      case 'direct': return NextResponse.json(await paidDirect(s, tenancy, String(b.chargeId ?? ''), { amount: Number(b.amount), date: String(b.date ?? ''), note: String(b.note ?? ''), takeFee: b.takeFee !== false, by }))
      case 'reduce': return NextResponse.json(await reduceDue(s, tenancy, String(b.chargeId ?? ''), Number(b.newDue), String(b.reason ?? ''), by))
      case 'plan': return NextResponse.json(await agreePlan(s, tenancy, { instalment: Number(b.instalment), startsOn: String(b.startsOn ?? ''), note: String(b.note ?? ''), by }))
      case 'end_plan': return NextResponse.json(await endPlan(s, tenancy, String(b.planId ?? ''), b.outcome === 'completed' || b.outcome === 'broken' ? b.outcome : 'cancelled', String(b.note ?? ''), by))
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 })
  }
}
