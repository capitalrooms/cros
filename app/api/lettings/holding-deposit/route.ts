/**
 * /api/lettings/holding-deposit — recording a holding deposit, and (only when ticked) telling people.
 *
 * GET                                  → { offers } recent offers with where each has got to:
 *                                         'sent' | 'completed' (application in) | 'claimed' (applicant says they've paid)
 *                                         | 'paid' (we've checked and recorded the holding deposit)
 * POST { applicantId, action: 'draft' } → the applicant's holding deposit records so far, and drafts of the landlord
 *                                         email and the new-housemate message, for review
 * POST { applicantId, action: 'send', holdingId?, amount, receivedOn, method, payerName, payerReference?, applyTo?,
 *        notes?, receipt?: { send, to }, landlord?: { send, to, subject, message }, housemates?: { send, title, message } }
 *                                      → without holdingId: writes the official numbered record (HOLD…, migration 198)
 *                                        and files its receipt in Letters & Invoices; marks the offer paid and moves
 *                                        the applicant on to referencing. With holdingId: uses that record as it is.
 *                                        Then sends only what was ticked — nothing goes out by default.
 * POST { applicantId, action: 'outcome', holdingId, status: 'reversed'|'refunded'|'retained', outcomeOn, reason }
 *                                      → closes a held record (the database keeps both and refuses later changes)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, STAFF_ROLES } from '@/lib/portalAuth'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { insertNotifications, activeTenantIds, dispatchChannels, tryPush } from '@/lib/serverNotify'
import { getCommsLive } from '@/lib/comms'
import { loadDepositContext, writeBios, landlordMessage, housemateMessage, holdingAmount, type DepositContext } from '@/lib/lettings/holdingDeposit'
import { holdingDepositsFor, recordHoldingDeposit, fileHoldingReceipt, longDate, METHODS, type HoldingDeposit } from '@/lib/lettings/holdingReceipt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const AFTER_APPLYING = ['applied', 'referencing', 'referencing_passed', 'docs_uploaded', 'converted']
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const emails = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\s]+/)).map((e: string) => String(e).trim()).filter(Boolean)
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function housemateIds(s: ReturnType<typeof svc>, ctx: DepositContext) {
  const ids = await activeTenantIds(s, ctx.applicant.property_id, null)
  return ids.filter(id => id !== ctx.applicant.converted_person_id)
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const { data: offers } = await s.from('offers')
    .select('id, applicant_id, applicant_name, applicant_email, advertised_rent, status, sent_at, rooms(name), properties(name)')
    .order('sent_at', { ascending: false }).limit(15) as { data: any[] | null }
  const ids = (offers ?? []).map(o => o.applicant_id).filter(Boolean)
  const { data: apps } = ids.length ? await s.from('applicants').select('id, pipeline_stage').in('id', ids) : { data: [] as any[] }
  const stage = new Map((apps ?? []).map((a: any) => [a.id, a.pipeline_stage]))
  return NextResponse.json({
    offers: (offers ?? []).map(o => ({
      id: o.id, applicantId: o.applicant_id, name: o.applicant_name || o.applicant_email, email: o.applicant_email,
      room: o.rooms?.name ?? '', property: o.properties?.name ?? '', rent: o.advertised_rent, sentAt: o.sent_at,
      state: o.status === 'deposit_paid' ? 'paid' : o.status === 'deposit_claimed' ? 'claimed' : AFTER_APPLYING.includes(stage.get(o.applicant_id) ?? '') ? 'completed' : 'sent',
    })),
  })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.applicantId) return NextResponse.json({ error: 'applicantId required' }, { status: 400 })

  const s = svc()
  const ctx = await loadDepositContext(s, b.applicantId)
  if (!ctx) return NextResponse.json({ error: 'Applicant not found' }, { status: 404 })

  if (b.action === 'draft') {
    const [bios, housemates, held] = await Promise.all([writeBios(ctx), housemateIds(s, ctx), holdingDepositsFor(s, ctx.applicant.id)])
    const l = landlordMessage(ctx, bios.landlordBio)
    const h = housemateMessage(ctx, bios.housemateBio)
    return NextResponse.json({
      applicant: { name: ctx.applicant.full_name, room: ctx.roomName, property: ctx.propertyName },
      alreadyPaid: ctx.offerStatus === 'deposit_paid',
      amount: holdingAmount(ctx),
      email: ctx.applicant.email,
      records: held.records,
      setupNeeded: held.setupNeeded,
      landlord: ctx.landlord ? { name: ctx.landlord.name, to: ctx.landlord.email, ...l } : null,
      housemates: { count: housemates.length, ...h },
    })
  }

  if (b.action === 'outcome') {
    const status = String(b.status ?? '')
    const reason = String(b.reason ?? '').trim().slice(0, 500)
    const outcomeOn = String(b.outcomeOn ?? '')
    if (!['reversed', 'refunded', 'retained'].includes(status)) return NextResponse.json({ error: 'Unknown outcome' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(outcomeOn)) return NextResponse.json({ error: 'Enter the date' }, { status: 400 })
    if (!reason) return NextResponse.json({ error: 'Say why — it stays on the record' }, { status: 400 })
    const { data, error } = await s.from('holding_deposits')
      .update({ status, outcome_on: outcomeOn, outcome_reason: reason, outcome_by: caller.email, outcome_at: new Date().toISOString() })
      .eq('id', b.holdingId).eq('applicant_id', ctx.applicant.id).eq('status', 'held').select('*')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!data?.length) return NextResponse.json({ error: 'That holding deposit isn’t held any more' }, { status: 409 })
    return NextResponse.json({ record: data[0] })
  }

  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const result: { recorded: boolean; holdNo?: string; receiptDocumentId?: string; receipt?: string; landlord?: string; housemates?: string; errors: string[] } = { recorded: false, errors: [] }

  // 1. The official record: a new one, or the one already on file
  let rec: HoldingDeposit
  let pdf: Buffer | undefined
  if (b.holdingId) {
    const { data } = await s.from('holding_deposits').select('*').eq('id', b.holdingId).eq('applicant_id', ctx.applicant.id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Holding deposit record not found' }, { status: 404 })
    rec = data as HoldingDeposit
  } else {
    const { record, error, status } = await recordHoldingDeposit(s, ctx, b, caller.email)
    if (!record) return NextResponse.json({ error }, { status: status ?? 500 })
    rec = record
    result.recorded = true

    // the applicant moves on to referencing (never backwards), the offer is paid, and a note says what was recorded
    const { data: me } = await s.from('people').select('first_name, full_name').eq('id', caller.personId).maybeSingle() as { data: any }
    const who = me?.first_name || me?.full_name || caller.email
    const note = `Holding deposit ${rec.hold_no}: ${gbp(Number(rec.amount))} received ${longDate(rec.received_on)} by ${METHODS[rec.method].toLowerCase()}${rec.payer_reference ? ` (ref ${rec.payer_reference})` : ''} — recorded by ${who}.`
    const { data: cur } = await s.from('applicants').select('admin_notes').eq('id', ctx.applicant.id).maybeSingle() as { data: any }
    const stageIdx = ['invited', 'applied', 'offer_sent', 'referencing'].indexOf(ctx.applicant.pipeline_stage ?? 'invited')
    const { error: aErr } = await s.from('applicants').update({
      ...(stageIdx >= 0 && stageIdx < 3 ? { pipeline_stage: 'referencing' } : {}),
      admin_notes: [cur?.admin_notes, note].filter(Boolean).join('\n'),
      updated_at: new Date().toISOString(),
    }).eq('id', ctx.applicant.id)
    if (aErr) result.errors.push(`Recorded as ${rec.hold_no}, but the applicant’s stage wasn’t moved on: ${aErr.message}`)
    if (ctx.offerId) await s.from('offers').update({ status: 'deposit_paid', updated_at: new Date().toISOString() }).eq('id', ctx.offerId)
  }
  result.holdNo = rec.hold_no

  // 2. The receipt is always filed (it's part of the record); emailing it is optional
  if (!rec.receipt_document_id) {
    const filed = await fileHoldingReceipt(s, rec, ctx, caller.email)
    if (filed.doc) { rec.receipt_document_id = filed.doc.id; pdf = filed.pdf }
    else result.errors.push(`Receipt not filed: ${filed.error}`)
  }
  result.receiptDocumentId = rec.receipt_document_id ?? undefined

  if (b.receipt?.send) {
    const to = emails(b.receipt.to)
    if (!to.length || to.some((e: string) => !isEmail(e))) result.errors.push('Receipt not emailed: check the address')
    else if (!rec.receipt_document_id) result.errors.push('Receipt not emailed: it couldn’t be made')
    else {
      if (!pdf) {
        const { data: d } = await s.from('generated_documents').select('storage_path').eq('id', rec.receipt_document_id).maybeSingle()
        const { data: blob } = d ? await s.storage.from('finance-docs').download(d.storage_path) : { data: null }
        if (blob) pdf = Buffer.from(await blob.arrayBuffer())
      }
      if (!pdf) result.errors.push('Receipt not emailed: the PDF couldn’t be read')
      else {
        const first = (ctx.applicant.full_name || rec.payer_name).trim().split(/\s+/)[0]
        const text = `Dear ${first},\n\nThank you — we have received your holding deposit of ${gbp(Number(rec.amount))} on ${longDate(rec.received_on)} for ${ctx.roomName}, ${ctx.propertyName}.\n\nYour receipt (${rec.hold_no}) is attached. It also explains what happens to your holding deposit from here. Please keep it.\n\nWe’ll be in touch about referencing shortly.`
        const { ok, error } = await sendEmail(to, `Your holding deposit receipt — ${rec.hold_no}`, messageHtml(text), {
          req, attachments: [{ filename: `Holding deposit receipt ${rec.hold_no}.pdf`, content: pdf.toString('base64') }],
        })
        if (ok) {
          const at = new Date().toISOString()
          result.receipt = to.join(', ')
          await s.from('holding_deposits').update({ receipt_emailed_at: at, receipt_emailed_to: to }).eq('id', rec.id)
          await s.from('generated_documents').update({ emailed_at: at, emailed_to: to, recipient_email: to.join(', ') }).eq('id', rec.receipt_document_id)
        } else result.errors.push(`Receipt not emailed: ${error ?? 'unknown error'}`)
      }
    }
  }

  // 3. The landlord (only when ticked)
  if (b.landlord?.send) {
    const to = emails(b.landlord.to)
    const subject = String(b.landlord.subject ?? '').trim(), message = String(b.landlord.message ?? '').trim()
    if (!to.length || to.some((e: string) => !isEmail(e))) result.errors.push('Landlord email not sent: check the address')
    else if (!subject || !message) result.errors.push('Landlord email not sent: subject or message empty')
    else {
      const { ok, error } = await sendEmail(to, subject, messageHtml(message), { req })
      if (ok) result.landlord = to.join(', ')
      else result.errors.push(`Landlord email not sent: ${error ?? 'unknown error'}`)
    }
  }

  // 4. The housemates (only when ticked) — app notification + push, and email
  if (b.housemates?.send) {
    const title = String(b.housemates.title ?? '').trim(), message = String(b.housemates.message ?? '').trim()
    if (!title || !message) result.errors.push('Housemates not told: message empty')
    else if (!(await getCommsLive())) result.errors.push('Housemates not told: tenant messages are paused')
    else {
      const ids = await housemateIds(s, ctx)
      if (ids.length) {
        const { error } = await insertNotifications(s, ids, { title, body: message, type: 'lettings', link: '/tenant' }, { propertyId: ctx.applicant.property_id })
        if (error) result.errors.push(`Housemates not told: ${error}`)
        else {
          await dispatchChannels(s, ids, { title, body: message, link: '/tenant' }, 'push_email', req)
          result.housemates = `${ids.length} housemate${ids.length === 1 ? '' : 's'}`
        }
      } else result.housemates = 'no current housemates'
    }
  }

  // 5. Confirmation to the office and lettings team, in the app and as a push (new records only)
  if (!result.recorded) return NextResponse.json(result)
  const { data: staff } = await s.from('people').select('id').in('role', STAFF_ROLES)
  const staffIds = (staff ?? []).map((p: any) => p.id)
  if (staffIds.length) {
    const title = '💷 Holding deposit received'
    const body = `${ctx.applicant.full_name} — ${ctx.roomName}, ${ctx.propertyName} · ${gbp(Number(rec.amount))} (${rec.hold_no}). Offer completed; referencing next.`
    await insertNotifications(s, staffIds, { title, body, type: 'lettings', link: '/admin/applicants' })
    await tryPush(staffIds, title, body, '/admin/applicants')
  }

  return NextResponse.json(result)
}
