// POST /api/admin/statements/[id]/approve { approve: boolean }
// Approve = the figures are checked and locked, and the statement is ready for the payment run.
// Un-approving is allowed only until it is paid (the database refuses after that) — every change is audited.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: st } = await s.from('landlord_statements').select('id, statement_reference, gross_rent, management_fees, letting_fees, property_charges, net_to_landlord, paid_date, approved_at').eq('id', id).maybeSingle()
  if (!st) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  if (b.approve) {
    const off = Math.round((Number(st.gross_rent) - Number(st.management_fees) - Number(st.letting_fees || 0) - Number(st.property_charges) - Number(st.net_to_landlord)) * 100)
    if (off !== 0) return NextResponse.json({ error: `${st.statement_reference} doesn’t balance, so it can’t be approved.` }, { status: 409 })
    const { error } = await s.from('landlord_statements').update({ approved_at: new Date().toISOString(), approved_by: admin.personId }).eq('id', id).is('approved_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, message: `${st.statement_reference} approved — it’s now in the payment run.` })
  }
  if (st.paid_date) return NextResponse.json({ error: 'It has been paid, so it can’t be un-approved.' }, { status: 409 })
  const { error } = await s.from('landlord_statements').update({ approved_at: null, approved_by: null }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, message: `${st.statement_reference} is back to draft.` })
}
