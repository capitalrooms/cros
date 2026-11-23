// POST /api/rent-paid/<token> — the tenant says they have paid a short month (lib/rent/paidClaim). Tells the finance
// team once a day at most per month; never changes the rent account. Staff check the bank and match the payment.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { insertNotifications } from '@/lib/serverNotify'
import { readPaidClaimToken } from '@/lib/rent/paidClaim'

export const dynamic = 'force-dynamic'

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const chargeId = readPaidClaimToken(token)
  if (!chargeId) return NextResponse.json({ error: 'This link has expired or isn’t right. Reply to the message and we’ll check.' }, { status: 400 })
  const s = createServiceClient()
  const { data: c } = await s.from('rent_charges').select('id, tenancy_id, room_id, property_id, charge_month, amount_due, amount_received, voided, rooms(name)').eq('id', chargeId).maybeSingle() as { data: any }
  if (!c || c.voided) return NextResponse.json({ error: 'We can’t find that rent. Reply to the message and we’ll check.' }, { status: 404 })
  const due = Number(c.amount_due || 0), received = Number(c.amount_received || 0)
  if (!(due - received > 0.005)) return NextResponse.json({ ok: true, message: 'Thank you. Your rent for this month already shows as paid in full.' })
  // once a day at most for this month, so a repeated tap doesn't flood the finance team
  const since = new Date(Date.now() - 86400_000).toISOString()
  const { data: recent } = await s.from('payment_audit_log').select('id').eq('rent_charge_id', chargeId).eq('action', 'tenant_says_paid').gte('performed_at', since).limit(1)
  if (recent?.length) return NextResponse.json({ ok: true, message: 'Thank you. We’ve already let the team know, and we’ll check the bank.' })
  const short = Math.round((due - received) * 100) / 100
  const month = new Date(`${String(c.charge_month).slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const { error: logErr } = await s.from('payment_audit_log').insert({ rent_charge_id: chargeId, action: 'tenant_says_paid', performed_by: null, performed_at: new Date().toISOString(), new_value: { short }, note: `Tenant says they have paid the ${gbp(short)} short for ${month}` })
  if (logErr) return NextResponse.json({ error: 'Couldn’t record that. Reply to the message and we’ll check.' }, { status: 500 })
  const { data: staff } = await s.from('people').select('id').in('role', ['administrator', 'admin', 'lettings'])
  const ids = (staff ?? []).map((p: any) => p.id)
  if (ids.length) {
    await insertNotifications(s, ids, {
      title: 'Tenant says they’ve paid',
      body: `${c.rooms?.name ?? 'Room'}: says they paid the ${gbp(short)} short for ${month}. Check the bank, then match the payment.`,
      type: 'finance', link: `/admin/lettings/${c.tenancy_id ?? ''}`,
    }, { propertyId: c.property_id, roomId: c.room_id })
  }
  return NextResponse.json({ ok: true, message: 'Thank you. We’ve let the team know. We’ll check the bank and confirm once it has arrived.' })
}
