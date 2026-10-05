// The official holding deposit record (migration 198) and its receipt.
//
// recordHoldingDeposit() writes the numbered HOLD record; the database fixes it from then on (no edits, no deletes,
// corrections by reversal). fileHoldingReceipt() renders the receipt on the letterhead — with the Tenant Fees Act
// 2019 terms the applicant is owed in writing — and files it in Letters & Invoices. Emailing it is a separate,
// optional step. Server-only.

import { oneWeekRent } from '@/lib/tenancy/deposit'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderFormalLetter, type FormalLetter } from '@/lib/letters/formalLetter'
import { signerForRequest } from '@/lib/letters/letterFromRequest'
import { saveDocument, type GeneratedDocument } from '@/lib/documents/generated'
import type { DepositContext } from '@/lib/lettings/holdingDeposit'

export const METHODS = { bank_transfer: 'Bank transfer', card: 'Card', cash: 'Cash', other: 'Other' } as const
export type Method = keyof typeof METHODS

export interface HoldingDeposit {
  id: string
  hold_no: string
  applicant_id: string
  offer_id: string | null
  tenancy_id: string | null
  property_id: string | null
  room_id: string | null
  payer_name: string
  amount: number
  received_on: string
  method: Method
  payer_reference: string | null
  apply_to: 'deposit' | 'first_rent'
  status: 'held' | 'applied' | 'refunded' | 'retained' | 'reversed'
  outcome_on: string | null
  outcome_reason: string | null
  outcome_by: string | null
  notes: string | null
  receipt_document_id: string | null
  receipt_emailed_at: string | null
  receipt_emailed_to: string[] | null
  recorded_by: string
  recorded_at: string
}

export const isMissingHoldingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /holding_deposits/.test(e.message ?? '') && /does not exist|schema cache/.test(e.message ?? ''))

const ISO = /^\d{4}-\d{2}-\d{2}$/
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const todayLondon = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export async function holdingDepositsFor(s: SupabaseClient, applicantId: string): Promise<{ records: HoldingDeposit[]; setupNeeded: boolean }> {
  const { data, error } = await s.from('holding_deposits').select('*').eq('applicant_id', applicantId).order('recorded_at', { ascending: true })
  if (error) return { records: [], setupNeeded: isMissingHoldingTable(error) }
  return { records: (data ?? []) as HoldingDeposit[], setupNeeded: false }
}

export interface RecordInput {
  amount: unknown; receivedOn: unknown; method: unknown; payerName: unknown; payerReference?: unknown; overCapConfirmed?: boolean
  applyTo?: unknown; notes?: unknown
}

/** Validates and writes the numbered record. The applicant's room, property and offer come from the context. */
export async function recordHoldingDeposit(s: SupabaseClient, ctx: DepositContext, input: RecordInput, callerEmail: string): Promise<{ record?: HoldingDeposit; error?: string; status?: number }> {
  const amount = Math.round(Number(String(input.amount ?? '').replace(/[£,\s]/g, '')) * 100) / 100
  const receivedOn = String(input.receivedOn ?? '')
  const method = String(input.method ?? '') as Method
  const payerName = String(input.payerName ?? '').trim().slice(0, 160)
  if (!(amount > 0)) return { error: 'Enter the amount received', status: 400 }
  if (amount > 5000) return { error: 'That amount looks too large for a holding deposit — check it', status: 400 }
  // the legal cap (Tenant Fees Act 2019): one week of the AGREED rent (lib/lettings/holdingDeposit agreedRent)
  if (ctx.rent && amount > oneWeekRent(ctx.rent) + 0.005 && !input.overCapConfirmed)
    return { error: `£${amount.toFixed(2)} is more than one week’s rent on the agreed £${ctx.rent.toFixed(2)} pcm — the legal cap is £${oneWeekRent(ctx.rent).toFixed(2)}. If the tenant really paid more, record it and refund the extra £${(amount - oneWeekRent(ctx.rent)).toFixed(2)} within 7 days.`, status: 409 }
  if (!ISO.test(receivedOn)) return { error: 'Enter the date the money was received', status: 400 }
  if (receivedOn > todayLondon()) return { error: 'The date received can’t be in the future', status: 400 }
  if (!(method in METHODS)) return { error: 'Choose how it was paid', status: 400 }
  if (!payerName) return { error: 'Enter who paid it', status: 400 }

  const { data, error } = await s.from('holding_deposits').insert({
    applicant_id: ctx.applicant.id,
    offer_id: ctx.offerId,
    person_id: ctx.applicant.converted_person_id,
    property_id: ctx.applicant.property_id,
    room_id: ctx.applicant.room_id,
    payer_name: payerName,
    amount,
    received_on: receivedOn,
    method,
    payer_reference: String(input.payerReference ?? '').trim().slice(0, 120) || null,
    apply_to: input.applyTo === 'first_rent' ? 'first_rent' : 'deposit',
    notes: String(input.notes ?? '').trim().slice(0, 1000) || null,
    recorded_by: callerEmail,
  }).select('*').single()
  if (error) {
    if (isMissingHoldingTable(error)) return { error: 'Run migration 198 in Supabase to start recording holding deposits', status: 503 }
    if (error.code === '23505') return { error: 'A holding deposit is already recorded for this applicant', status: 409 }
    return { error: error.message, status: 400 }   // e.g. a closed month, from the period guard
  }
  return { record: data as HoldingDeposit }
}

/** The receipt as a letter on the letterhead. */
export function receiptLetter(rec: HoldingDeposit, ctx: DepositContext, recipientAddress: string): FormalLetter {
  const first = (ctx.applicant.full_name || rec.payer_name).trim().split(/\s+/)[0]
  const deadline = addDays(rec.received_on, 15)
  const where = [ctx.roomName, ctx.propertyName || ctx.propertyAddress].filter(Boolean).join(', ')
  const rows = [
    `| Receipt number | ${rec.hold_no} |`,
    `| Amount received | **${gbp(Number(rec.amount))}** |`,
    `| Date received | ${longDate(rec.received_on)} |`,
    `| Received from | ${rec.payer_name} |`,
    `| Paid by | ${METHODS[rec.method]}${rec.payer_reference ? ` (reference ${rec.payer_reference})` : ''} |`,
    ...(ctx.startDate ? [`| Intended move-in | ${longDate(ctx.startDate)} |`] : []),
    `| Deadline for agreement | ${longDate(deadline)} |`,
  ]
  const towards = rec.apply_to === 'first_rent' ? 'your first month’s rent' : 'your tenancy deposit'
  return {
    recipientName: ctx.applicant.full_name || rec.payer_name,
    recipientAddress,
    date: rec.recorded_at.slice(0, 10),
    reference: rec.hold_no,
    subject: `Holding deposit receipt ${rec.hold_no}`,
    salutation: `Dear ${first}`,
    body: [
      `Thank you for your holding deposit for ${where}${ctx.rent ? ` at ${gbp(ctx.rent)} per month` : ''}. This letter is your receipt — please keep it.`,
      rows.join('\n'),
      '## What happens to your holding deposit',
      `We hold it in our client account. If the tenancy goes ahead, it will be put towards ${towards}, with your agreement. The deadline for agreement is ${longDate(deadline)} (15 days after we received it), unless we agree a different date with you in writing.`,
      `We will refund it in full within 7 days if the landlord decides not to go ahead, or if the tenancy agreement isn’t entered into by the deadline for a reason that isn’t yours.`,
      `We may keep it if you give false or misleading information that reasonably affects the decision to let to you, if you don’t pass a Right to Rent check, if you decide not to go ahead, or if you don’t take all reasonable steps to enter into the tenancy agreement by the deadline. If we do, we will tell you why in writing within 7 days. These are your rights under the Tenant Fees Act 2019; if anything on this receipt is wrong, please let us know.`,
    ].join('\n\n'),
    closing: 'Yours sincerely',
  }
}

/** Renders the receipt, files it in Letters & Invoices and links it to the record. */
export async function fileHoldingReceipt(s: SupabaseClient, rec: HoldingDeposit, ctx: DepositContext, callerEmail: string): Promise<{ pdf?: Buffer; doc?: GeneratedDocument; error?: string }> {
  const { data: a } = await s.from('applicants').select('*').eq('id', ctx.applicant.id).maybeSingle() as { data: any }
  const address = String(a?.current_address ?? '').split(/\s*,\s*|\n/).map(l => l.trim()).filter(Boolean).join('\n')
  const letter = receiptLetter(rec, ctx, address)
  let pdf: Buffer
  try { pdf = await renderFormalLetter(letter, await signerForRequest(callerEmail, null)) }
  catch (e) { console.error('holding receipt render failed', e); return { error: 'The receipt PDF could not be made' } }
  const { doc, error } = await saveDocument({
    id: rec.receipt_document_id,
    pdf,
    fields: {
      kind: 'receipt', number: rec.hold_no, title: `Holding deposit — ${ctx.roomName}, ${ctx.propertyName}`,
      recipient_name: letter.recipientName, property_id: rec.property_id, total: Number(rec.amount),
      content: { holdingDepositId: rec.id, letter },
    },
    recipientEmail: ctx.applicant.email,
    callerEmail,
  })
  if (!doc) return { pdf, error: error ?? 'The receipt could not be filed' }
  if (rec.receipt_document_id !== doc.id) await s.from('holding_deposits').update({ receipt_document_id: doc.id }).eq('id', rec.id)
  return { pdf, doc }
}
