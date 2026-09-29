/**
 * POST /api/admin/bank-import/confirm
 * Commit a previewed bank import.
 *
 * Receives the full transactions array from the preview response.
 * The caller may optionally exclude specific transactions (e.g. possible_dupes
 * they want to ignore, or unmatched they're not ready to allocate).
 *
 * Safety guarantees:
 *   1. bank_transactions insert uses ON CONFLICT (dedup_hash) DO NOTHING —
 *      re-submitting the same batch twice is always safe, zero duplicates.
 *   2. possible_dupe transactions are inserted with status='possible_duplicate'
 *      and are NEVER used to update rent_charges automatically.
 *   3. Every rent_charge update is written to payment_audit_log.
 *   4. All inserts happen in sequence; if any rent_charge update fails, it is
 *      logged as a warning but does not roll back the already-inserted transactions
 *      (the bank_transaction row is your audit trail regardless).
 *
 * Body: { transactions: PreviewTransaction[], filename: string, bank_name?: string,
 *          period_from?: string, period_to?: string, notes?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase'
import { getCommsLive } from '@/lib/comms'
import { insertNotifications } from '@/lib/serverNotify'
import { ensureTenancyCharge } from '@/lib/rentCharges/generate'
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
  const { transactions, filename, bank_name, period_from, period_to, notes } = body

  if (!transactions?.length)
    return NextResponse.json({ error: 'No transactions to import' }, { status: 400 })

  const now = new Date().toISOString()
  const actionable = transactions.filter((t: any) => t.category !== 'already_imported')

  // ── Create import batch record ────────────────────────────────────────────
  const { data: batch, error: batchErr } = await supabase
    .from('bank_import_batches')
    .insert({
      filename: filename || 'import.csv',
      bank_name: bank_name || null,
      period_from: period_from || null,
      period_to: period_to || null,
      transaction_count: actionable.length,
      credit_total: actionable.reduce((s: number, t: any) => s + Number(t.amount), 0),
      new_matched:       actionable.filter((t: any) => t.category === 'matched').length,
      new_unmatched:     actionable.filter((t: any) => t.category === 'unmatched').length,
      duplicates_skipped: transactions.filter((t: any) => t.category === 'already_imported').length,
      possible_dupes:    actionable.filter((t: any) => t.category === 'possible_dupe').length,
      imported_by: person.id,
      imported_at: now,
      notes: notes || null,
    })
    .select('id')
    .single()
  if (batchErr || !batch) return NextResponse.json({ error: 'Failed to create import batch: ' + batchErr?.message }, { status: 500 })

  const batchId = batch.id
  const results = { matched: 0, possible_dupes: 0, unmatched: 0, skipped: 0, errors: [] as string[], spread: [] as string[], over: [] as string[] }

  // ── Insert bank_transaction rows (idempotent — dedup hash is unique) ────────
  const svcClient = createServiceClient()
  for (const txn of actionable) {
    // Matched to a tenancy whose rent for that month hadn't been raised yet — raise it now, then record the payment
    if (txn.category === 'matched' && !txn.rent_charge_id && txn.raise_charge_month && txn.tenancy_id) {
      txn.rent_charge_id = await ensureTenancyCharge(svcClient, txn.tenancy_id, txn.raise_charge_month)
      if (!txn.rent_charge_id) txn.category = 'unmatched'
    }
    const txnStatus =
      txn.category === 'matched'       ? 'matched'
      : txn.category === 'possible_dupe' ? 'possible_duplicate'
      : 'unmatched'

    const { data: inserted, error: txnErr } = await supabase
      .from('bank_transactions')
      .upsert({
        batch_id:         batchId,
        transaction_date: txn.transaction_date,
        amount:           txn.amount,
        description:      txn.description,
        extracted_ref:    txn.extracted_ref || null,
        dedup_hash:       txn.dedup_hash,
        status:           txnStatus,
        property_id:      txn.property_id || null,
        matched_rent_charge_id: txn.category === 'matched' ? txn.rent_charge_id : null,
        matched_at:             txn.category === 'matched' ? now : null,
        matched_by:             txn.category === 'matched' ? person.id : null,
        imported_at:      now,
        imported_by:      person.id,
      }, { onConflict: 'dedup_hash', ignoreDuplicates: true })
      .select('id')
      .maybeSingle()

    if (txnErr) {
      results.errors.push(`Row ${txn.transaction_date} ${txn.description}: ${txnErr.message}`)
      continue
    }

    const txnId = inserted?.id

    // ── Update matched rent_charges ──────────────────────────────────────────
    if (txn.category === 'matched' && txn.rent_charge_id) {
      // Re-check status — another session might have paid this while the user was reviewing
      const { data: charge } = await supabase
        .from('rent_charges')
        .select('status, amount_due, amount_received')
        .eq('id', txn.rent_charge_id)
        .single()

      if (!charge) {
        results.errors.push(`Charge not found for ${txn.tenant_name || txn.description}`)
        results.unmatched++
        continue
      }

      if (charge.status === 'paid') {
        // Race condition — was paid between preview and confirm. Demote to possible_dupe.
        await supabase.from('bank_transactions').update({ status: 'possible_duplicate', matched_rent_charge_id: null, matched_at: null, matched_by: null }).eq('id', txnId)
        await supabase.from('bank_import_batches').update({ possible_dupes: results.possible_dupes + 1, new_matched: results.matched }).eq('id', batchId)
        results.possible_dupes++
        results.errors.push(`${txn.tenant_name || 'Tenant'} — charge already paid by the time import confirmed (treated as possible duplicate)`)
        continue
      }

      // Oldest debt first, then credit forward (lib/payments/apply) — dated when the money arrived
      let rcErr: { message: string } | null = null
      try {
        const res = await applyPayment(svcClient, {
          chargeId: txn.rent_charge_id, tenancyId: txn.tenancy_id, amount: Number(txn.amount), date: txn.transaction_date,
          txnId: txnId || null, personId: person.id, action: 'csv_matched', note: `Imported from ${filename || 'bank CSV'} — batch ${batchId}`,
        })
        if (res.allocations.length > 1) results.spread.push(`${txn.tenant_name || txn.description}: £${Number(txn.amount).toFixed(2)} covered ${res.allocations.length} months`)
        if (res.over) results.over.push(`${txn.tenant_name || txn.description}: £${res.over.toFixed(2)} more than owed`)
      } catch (e: any) { rcErr = { message: e.message } }

      if (rcErr) {
        results.errors.push(`Failed to update charge for ${txn.tenant_name || txn.description}: ${rcErr.message}`)
      } else {
        results.matched++

        // ── Save bank sender name to tenancy ──────────────────────────────────
        // On an exact-reference match, save the payer's bank display name so
        // future payments without a reference can be matched by sender name.
        if (txn.tenancy_id && txn.sender_name) {
          // Only update if the column is currently null — don't overwrite a confirmed name
          await supabase
            .from('tenancies')
            .update({ bank_sender_name: txn.sender_name })
            .eq('id', txn.tenancy_id)
            .is('bank_sender_name', null)
        }

        // ── Wrong/missing reference notification ──────────────────────────────
        // If the payment was matched but the reference was missing or wrong,
        // send the tenant a polite reminder with their correct reference.
        const usedCorrectRef = txn.extracted_ref &&
          txn.extracted_ref.toUpperCase() === txn.expected_ref?.toUpperCase()

        if (!usedCorrectRef && txn.tenant_person_id) {
          try {
            const commsLive = await getCommsLive()
            if (commsLive) {
              const service = createServiceClient()
              const paymentDate = new Date(txn.transaction_date).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric'
              })
              const refUsed = txn.extracted_ref || 'no reference'
              await insertNotifications(
                service,
                [txn.tenant_person_id],
                {
                  title: 'Rent payment received',
                  body: `Thank you — your rent payment of £${Number(txn.amount).toFixed(2)} was received on ${paymentDate}. ` +
                    `For future payments please use your unique reference: ${txn.expected_ref}. ` +
                    `This helps us allocate your payment instantly (your payment used: ${refUsed}).`,
                  type: 'finance',
                },
              )
            }
          } catch (_) {
            // Notification failure must never block the financial import
          }
        }
      }
    } else if (txn.category === 'possible_dupe') {
      results.possible_dupes++
    } else {
      results.unmatched++
    }
  }

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    results,
    message: [
      `${results.matched} payment${results.matched !== 1 ? 's' : ''} confirmed`,
      results.possible_dupes > 0 ? `${results.possible_dupes} possible duplicate${results.possible_dupes !== 1 ? 's' : ''} held for review` : null,
      results.unmatched > 0 ? `${results.unmatched} unmatched` : null,
      results.spread.length ? `${results.spread.length} covered more than one month` : null,
      results.over.length ? `${results.over.length} paid more than owed — check the charge` : null,
    ].filter(Boolean).join(' · '),
  })
}
