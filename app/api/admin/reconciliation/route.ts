/**
 * POST /api/admin/reconciliation
 * Confirm or reject a landlord_statement_rooms row.
 *
 * Body: { id: string, action: 'confirm' | 'reject', rejection_note?: string }
 *
 * On confirm:
 *   - Marks the LSR row confirmed
 *   - Nothing else — rent charges are never raised or settled from imported statements (15 Oct 2026)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })

  // Auth check
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await supabase
    .from('people')
    .select('id, role')
    .eq('email', session.user.email)
    .single()

  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, action, rejection_note } = body

  if (!id || !['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 })
  }

  // Fetch the LSR row
  const { data: lsr, error: fetchErr } = await supabase
    .from('landlord_statement_rooms')
    .select('*, statement:landlord_statements(period_start, period_end, statement_date)')
    .eq('id', id)
    .single()

  if (fetchErr || !lsr) return NextResponse.json({ error: 'Row not found' }, { status: 404 })

  if (action === 'reject') {
    const { error } = await supabase
      .from('landlord_statement_rooms')
      .update({ rejected: true, rejection_note: rejection_note || null, confirmed: false })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // action === 'confirm'
  const now = new Date().toISOString()

  // Confirming only confirms the match (room, tenant). It never raises or settles CROS's own rent charges: these lines
  // come from the previous agent's statements — they collected that rent (15 Oct 2026; it used to mark charges "paid"
  // with the statement's figure, including CROS's own). The rent roll reads the lines directly (lib/finance/importedRent).
  const rentChargeId = null as string | null

  // Mark LSR confirmed
  const { error: lsrErr } = await supabase
    .from('landlord_statement_rooms')
    .update({
      confirmed: true,
      confirmed_at: now,
      confirmed_by: person.id,
      rejected: false,
      rejection_note: null,
      ...(rentChargeId ? { rent_charge_id: rentChargeId } : {}),
    })
    .eq('id', id)

  if (lsrErr) return NextResponse.json({ error: lsrErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, rent_charge_id: rentChargeId })
}
