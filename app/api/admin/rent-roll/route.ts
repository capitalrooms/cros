// GET /api/admin/rent-roll?month=YYYY-MM — every room's rent for the month, what has arrived and what's missing,
// and per property what's ready to go on a statement (lib/finance/rentRoll).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { buildRentRoll } from '@/lib/finance/rentRoll'
import { demoPropertyIds } from '@/lib/demoProperties'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const month = req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7)
  try {
    return NextResponse.json(await buildRentRoll(createServiceClient(), month, { practice: req.nextUrl.searchParams.get('practice') === '1' }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load the rent roll' }, { status: 400 })
  }
}

// POST { action: 'practice_refs' } — practice mode only: give demo houses' tenancies the payment reference the bank
// import matches on (lib/tenancy/paymentRef), so a practice bank CSV can be tested. Never touches a real tenancy.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  // pay this landlord the rents that are in now, rather than waiting for the rest (migration 255) — or undo it
  if (b.action === 'pay_part' || b.action === 'wait_all') {
    const admin = await requireAdmin(req)
    if (!/^\d{4}-\d{2}$/.test(String(b.month)) || !b.propertyId) return NextResponse.json({ error: 'propertyId and month required' }, { status: 400 })
    const s = createServiceClient()
    const { error } = b.action === 'pay_part'
      ? await s.from('rent_pay_part').upsert({ property_id: b.propertyId, month: b.month, reason: String(b.reason ?? '').trim().slice(0, 300) || null, created_by: admin?.email ?? null })
      : await s.from('rent_pay_part').delete().eq('property_id', b.propertyId).eq('month', b.month)
    if (error) return NextResponse.json({ error: /rent_pay_part/.test(error.message) ? 'Needs migration 255 running in Supabase.' : error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (b.action !== 'practice_refs') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const s = createServiceClient()
  const demo = await demoPropertyIds(s)
  if (!demo.size) return NextResponse.json({ ok: true, filled: 0 })
  const { data } = await s.from('tenancies').select('id, property_id, payment_reference, rooms(name), properties(name, is_demo)').in('property_id', [...demo]).is('payment_reference', null)
  let filled = 0
  for (const t of (data ?? []) as any[]) {
    if (!t.properties?.is_demo || !t.rooms?.name) continue
    const ref = buildPaymentRef(t.properties.name, t.rooms.name)
    const { error } = await s.from('tenancies').update({ payment_reference: ref }).eq('id', t.id).is('payment_reference', null)
    if (!error) filled++
  }
  return NextResponse.json({ ok: true, filled })
}
