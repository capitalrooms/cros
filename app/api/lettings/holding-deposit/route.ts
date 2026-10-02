/**
 * /api/lettings/holding-deposit — recording a holding deposit and telling people about the new tenant.
 *
 * GET                                  → { offers } recent offers with where each has got to:
 *                                         'sent' | 'completed' (application in) | 'claimed' (applicant says they've paid)
 *                                         | 'paid' (we've checked and recorded the holding deposit)
 * POST { applicantId, action: 'draft' } → drafts of the landlord email and the new-housemate message, for review
 * POST { applicantId, action: 'send', amount, landlord?: { send, to, subject, message },
 *        housemates?: { send, title, message } }
 *                                      → marks the offer paid, moves the applicant on to referencing, sends what
 *                                        was ticked, and pushes a confirmation to the office and lettings team.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, STAFF_ROLES } from '@/lib/portalAuth'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { insertNotifications, activeTenantIds, dispatchChannels, tryPush } from '@/lib/serverNotify'
import { getCommsLive } from '@/lib/comms'
import { loadDepositContext, writeBios, landlordMessage, housemateMessage, holdingAmount, type DepositContext } from '@/lib/lettings/holdingDeposit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const AFTER_APPLYING = ['applied', 'referencing', 'referencing_passed', 'docs_uploaded', 'converted']
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

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
    const [bios, housemates] = await Promise.all([writeBios(ctx), housemateIds(s, ctx)])
    const l = landlordMessage(ctx, bios.landlordBio)
    const h = housemateMessage(ctx, bios.housemateBio)
    return NextResponse.json({
      applicant: { name: ctx.applicant.full_name, room: ctx.roomName, property: ctx.propertyName },
      alreadyPaid: ctx.offerStatus === 'deposit_paid',
      amount: holdingAmount(ctx),
      landlord: ctx.landlord ? { name: ctx.landlord.name, to: ctx.landlord.email, ...l } : null,
      housemates: { count: housemates.length, ...h },
    })
  }

  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const amount = Number(b.amount) || holdingAmount(ctx) || 0
  const result: { recorded: boolean; landlord?: string; housemates?: string; errors: string[] } = { recorded: false, errors: [] }

  // 1. Record it: offer → paid, applicant → referencing (never backwards), a note on the applicant
  const { data: me } = await s.from('people').select('first_name, full_name').eq('id', caller.personId).maybeSingle() as { data: any }
  const who = me?.first_name || me?.full_name || caller.email
  const note = `Holding deposit${amount ? ` £${amount.toFixed(2)}` : ''} received ${new Date().toLocaleDateString('en-GB')} — recorded by ${who}.`
  const { data: cur } = await s.from('applicants').select('admin_notes').eq('id', ctx.applicant.id).maybeSingle() as { data: any }
  const stageIdx = ['invited', 'applied', 'offer_sent', 'referencing'].indexOf(ctx.applicant.pipeline_stage ?? 'invited')
  const { error: aErr } = await s.from('applicants').update({
    ...(stageIdx >= 0 && stageIdx < 3 ? { pipeline_stage: 'referencing' } : {}),
    admin_notes: [cur?.admin_notes, note].filter(Boolean).join('\n'),
    updated_at: new Date().toISOString(),
  }).eq('id', ctx.applicant.id)
  if (aErr) return NextResponse.json({ error: `Could not record the deposit: ${aErr.message}` }, { status: 500 })
  if (ctx.offerId) await s.from('offers').update({ status: 'deposit_paid', updated_at: new Date().toISOString() }).eq('id', ctx.offerId)
  result.recorded = true

  // 2. The landlord
  if (b.landlord?.send) {
    const to = (Array.isArray(b.landlord.to) ? b.landlord.to : String(b.landlord.to ?? '').split(/[,;\s]+/)).map((e: string) => e.trim()).filter(Boolean)
    const subject = String(b.landlord.subject ?? '').trim(), message = String(b.landlord.message ?? '').trim()
    if (!to.length || to.some((e: string) => !isEmail(e))) result.errors.push('Landlord email not sent: check the address')
    else if (!subject || !message) result.errors.push('Landlord email not sent: subject or message empty')
    else {
      const { ok, error } = await sendEmail(to, subject, messageHtml(message), { req })
      if (ok) result.landlord = to.join(', ')
      else result.errors.push(`Landlord email not sent: ${error ?? 'unknown error'}`)
    }
  }

  // 3. The housemates — app notification + push, and email
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

  // 4. Confirmation to the office and lettings team, in the app and as a push
  const { data: staff } = await s.from('people').select('id').in('role', STAFF_ROLES)
  const staffIds = (staff ?? []).map((p: any) => p.id)
  if (staffIds.length) {
    const title = '💷 Holding deposit received'
    const body = `${ctx.applicant.full_name} — ${ctx.roomName}, ${ctx.propertyName}${amount ? ` · £${amount.toFixed(2)}` : ''}. Offer completed; referencing next.`
    await insertNotifications(s, staffIds, { title, body, type: 'lettings', link: '/admin/applicants' })
    await tryPush(staffIds, title, body, '/admin/applicants')
  }

  return NextResponse.json(result)
}
