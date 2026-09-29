/**
 * POST /api/admin/bank-import/allocate
 *
 * Manually (or fuzzy-confirm) allocates an unmatched bank_transaction to a
 * rent_charge. Called from the Reconciliation → Unmatched Transactions tab.
 *
 * Body: {
 *   transaction_id: string
 *   rent_charge_id: string
 *   tenancy_id: string
 *   match_method: 'manual' | 'fuzzy_confirmed'
 *   note?: string
 * }
 *
 * Safety:
 *   - Re-checks the transaction is still unmatched at allocation time
 *   - Money beyond what the charge needs goes to older arrears, then the next months (lib/payments/apply)
 *   - Writes to payment_audit_log with match_method for full trail
 *   - Updates bank_transactions.status → 'matched'
 *   - Updates rent_charges.status → 'paid' | 'partial'
 *   - Saves bank_sender_name to tenancy if not already set (same as import confirm)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { applyPayment } from '@/lib/payments/apply'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase
    .from('people').select('id, role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { transaction_id, rent_charge_id, tenancy_id, match_method, note } = body

  if (!transaction_id || !rent_charge_id || !tenancy_id || !match_method)
    return NextResponse.json({ error: 'transaction_id, rent_charge_id, tenancy_id and match_method are required' }, { status: 400 })
  if (!['manual', 'fuzzy_confirmed'].includes(match_method))
    return NextResponse.json({ error: 'match_method must be "manual" or "fuzzy_confirmed"' }, { status: 400 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const now = new Date().toISOString()

  // ── Race-condition re-checks ────────────────────────────────────────────────
  const { data: txn } = await service
    .from('bank_transactions')
    .select('id, amount, description, status, dedup_hash, transaction_date')
    .eq('id', transaction_id)
    .single()

  if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  if (txn.status !== 'unmatched')
    return NextResponse.json({ error: `Transaction is already ${txn.status} — cannot reallocate` }, { status: 409 })

  const { data: charge } = await service
    .from('rent_charges')
    .select('id, status, amount_due, amount_received, voided')
    .eq('id', rent_charge_id)
    .single()

  if (!charge) return NextResponse.json({ error: 'Rent charge not found' }, { status: 404 })
  // A charge that's already paid is fine: the money rolls on to older arrears or the next months (lib/payments/apply)
  if ((charge as any).voided) return NextResponse.json({ error: 'That charge has been cleared — pick another month' }, { status: 409 })

  // Claim the transaction first so two clicks (or two people) can't spend the same money twice
  const { data: claimed } = await service.from('bank_transactions')
    .update({ status: 'matched', matched_rent_charge_id: rent_charge_id, matched_at: now, matched_by: person.id })
    .eq('id', transaction_id).eq('status', 'unmatched').select('id')
  if (!claimed?.length) return NextResponse.json({ error: 'That payment has just been allocated by someone else' }, { status: 409 })

  let result
  try {
    result = await applyPayment(service, {
      chargeId: rent_charge_id, tenancyId: tenancy_id, amount: Number(txn.amount), date: txn.transaction_date,
      txnId: transaction_id, personId: person.id, action: match_method === 'fuzzy_confirmed' ? 'fuzzy_confirmed' : 'manual_allocated',
      note: note || `Manually allocated from Reconciliation — ${match_method}`,
    })
  } catch (e: any) {
    await service.from('bank_transactions').update({ status: 'unmatched', matched_rent_charge_id: null, matched_at: null, matched_by: null }).eq('id', transaction_id)
    return NextResponse.json({ error: 'Failed to update rent charge: ' + e.message }, { status: 500 })
  }
  const newStatus = result.allocations.find(a => a.chargeId === rent_charge_id)?.status ?? charge.status

  // ── Save bank_sender_name to tenancy (if not already set) ──────────────────
  // Extract sender name from description using same logic as parseBank.ts
  const senderName = extractSenderNameSimple(txn.description)
  if (senderName && tenancy_id) {
    await service
      .from('tenancies')
      .update({ bank_sender_name: senderName })
      .eq('id', tenancy_id)
      .is('bank_sender_name', null)
  }

  return NextResponse.json({
    ok: true,
    new_status: newStatus,
    amount_received: txn.amount,
    allocations: result.allocations,
    over: result.over,
    match_method,
  })
}

// Simplified sender name extraction (mirrors lib/parseBank.ts logic)
const NOISE = /\b(FASTER PAYMENT(S)?|STANDING ORDER|DIRECT DEBIT|BACS|CHAPS|FPS|FT|TFR|TRANSFER|REF|PAYMENT|RENT|FROM|TO|VIA|ONLINE)\b/gi
const REF_PAT = /(?:CR[-\s]?)?[0-9]{2,3}[A-Z]{2,5}[\/\- ]?R\d{1,2}/gi

function extractSenderNameSimple(description: string): string | null {
  let s = description.trim()
  s = s.replace(REF_PAT, ' ')
  s = s.replace(NOISE, ' ')
  s = s.replace(/\b\d[\d\s\-*]+\b/g, ' ')
  s = s.replace(/[^A-Za-z '-]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim().slice(0, 60)
  return s.length >= 3 ? s : null
}
