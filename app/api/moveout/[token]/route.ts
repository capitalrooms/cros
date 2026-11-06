// /api/moveout/<token> — the tenant's online move-out form (4 Nov 2026). The token is their signed link from the
// move-out email (lib/checkout/moveOutLink); nobody signs in.
//   GET  → what the form needs to show (their name, the place, the date, the deposit) and anything already saved
//   POST { answers, cleanerHours, cleanerAgreed } → saved on move_out_forms (migration 262), logged on the letting
//        file, and the office is emailed. Booking the cleaner needs "take it from my deposit" ticked.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { readMoveOutToken, MOVE_OUT_CLEAN_RATE } from '@/lib/checkout/moveOutLink'
import { moveOutChecklist, moveOutCharges } from '@/lib/checkout/moveOut'
import { isWholeLet, placeLabel } from '@/lib/lettings/letWording'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail, getBusinessSettings } from '@/lib/emailWrapper'
import { card, facts, para, esc } from '@/lib/email/blocks'
import { displayName } from '@/lib/people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const missingTable = (e: any) => /move_out_forms/.test(String(e?.message ?? ''))
const str = (v: unknown, max = 600) => String(v ?? '').slice(0, max).trim()

async function load(token: string) {
  const id = readMoveOutToken(token)
  if (!id) return null
  const s = createServiceClient()
  const { data: t } = await s.from('tenancies')
    .select('id, end_date, deposit_amount, deposit_protected_at, people!person_id(salutation, first_name, last_name, full_name), rooms(name), properties(name, address, property_type)')
    .eq('id', id).maybeSingle() as { data: any }
  if (!t) return null
  return { s, t }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const got = await load((await params).token)
  if (!got) return NextResponse.json({ error: 'This link isn’t right or has run out. Reply to your move-out email and we’ll send a new one.' }, { status: 404 })
  const { s, t } = got
  const whole = isWholeLet(t.properties?.property_type, t.rooms?.name)
  const { data: saved, error } = await s.from('move_out_forms').select('answers, cleaner_hours, cleaner_agreed_at, submitted_at, updated_at').eq('tenancy_id', t.id).maybeSingle()
  const biz = await getBusinessSettings()
  return NextResponse.json({
    firstName: t.people?.first_name || displayName(t.people) || '',
    place: placeLabel(whole, t.rooms?.name, t.properties?.address || t.properties?.name),
    whole, moveOutDate: t.end_date, deposit: t.deposit_amount != null ? Number(t.deposit_amount) : null, depositProtected: !!t.deposit_protected_at,
    rate: MOVE_OUT_CLEAN_RATE, checklist: moveOutChecklist(whole), charges: moveOutCharges({ whole, depositProtected: !!t.deposit_protected_at }),
    saved: saved ?? null, ready: !(error && missingTable(error)),
    contact: { email: biz.email, phone: biz.phone },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const got = await load((await params).token)
  if (!got) return NextResponse.json({ error: 'This link isn’t right or has run out.' }, { status: 404 })
  const { s, t } = got
  const b = await req.json().catch(() => ({}))
  const a = (b.answers ?? {}) as Record<string, unknown>
  const answers = {
    forwardingAddress: str(a.forwardingAddress), phoneAfter: str(a.phoneAfter, 40), emailAfter: str(a.emailAfter, 120),
    meters: { gas: str((a.meters as any)?.gas, 40), electricity: str((a.meters as any)?.electricity, 40), water: str((a.meters as any)?.water, 40), readAt: str((a.meters as any)?.readAt, 60) },
    keys: str(a.keys, 300), keysOn: str(a.keysOn, 40), issues: str(a.issues, 2000), other: str(a.other, 2000),
    ticked: (Array.isArray(a.ticked) ? a.ticked : []).map(x => str(x, 200)).slice(0, 40),
  }
  const hours = Number(b.cleanerHours) > 0 ? Math.min(12, Math.round(Number(b.cleanerHours) * 2) / 2) : null
  if (hours && b.cleanerAgreed !== true) return NextResponse.json({ error: `Tick the box to say the clean (£${(hours * MOVE_OUT_CLEAN_RATE).toFixed(2)}) can come off your deposit, or choose no clean.` }, { status: 400 })
  const { data: before } = await s.from('move_out_forms').select('cleaner_hours').eq('tenancy_id', t.id).maybeSingle()
  const now = new Date().toISOString()
  const { error } = await s.from('move_out_forms').upsert({
    tenancy_id: t.id, answers, cleaner_hours: hours, cleaner_rate: hours ? MOVE_OUT_CLEAN_RATE : null, cleaner_agreed_at: hours ? now : null, updated_at: now,
  }, { onConflict: 'tenancy_id' })
  if (error) return NextResponse.json({ error: missingTable(error) ? 'The form can’t be saved just yet — please reply to your move-out email with your answers.' : 'Something went wrong saving your form — please try again.' }, { status: 500 })

  const who = displayName(t.people) || 'The tenant'
  const whole = isWholeLet(t.properties?.property_type, t.rooms?.name)
  const place = placeLabel(whole, t.rooms?.name, t.properties?.address || t.properties?.name)
  await logTenancyEvent(s, t.id, 'move_out_form', `Move-out form ${before ? 'updated' : 'sent'} by ${who}${hours ? ` · cleaner booked for ${hours} hour${hours === 1 ? '' : 's'} (£${(hours * MOVE_OUT_CLEAN_RATE).toFixed(2)} from the deposit)` : ''}`, 'tenant')
  // tell the office — a staff email, not to the tenant
  try {
    const biz = await getBusinessSettings()
    const rows: [string, string][] = [
      ['Forwarding address', answers.forwardingAddress || '—'], ['Phone after', answers.phoneAfter || '—'], ['Email after', answers.emailAfter || '—'],
      ...(whole ? [['Meters', [answers.meters.gas && `gas ${answers.meters.gas}`, answers.meters.electricity && `electricity ${answers.meters.electricity}`, answers.meters.water && `water ${answers.meters.water}`].filter(Boolean).join(' · ') || '—'] as [string, string]] : []),
      ['Keys', [answers.keys, answers.keysOn && `back ${answers.keysOn}`].filter(Boolean).join(' · ') || '—'],
      ['Cleaner', hours ? `${hours} hours · £${(hours * MOVE_OUT_CLEAN_RATE).toFixed(2)} from the deposit (agreed)` : 'Not booked'],
    ]
    const html = await buildEmail([
      para(`${who} has ${before ? 'updated' : 'filled in'} their move-out form for ${place}.`),
      card('Their answers', facts(rows), 'mint'),
      answers.issues ? card('Anything broken or not working', `<p style="margin:0">${esc(answers.issues)}</p>`) : '',
      answers.other ? card('Anything else', `<p style="margin:0">${esc(answers.other)}</p>`) : '',
    ].join(''), { kind: 'office-move-out-form', signature: false })
    await deliverEmail({ to: [biz.email], subject: `Move-out form — ${who}, ${place}${hours ? ` · cleaner ${hours}h` : ''}`, html }, { req })
  } catch (e) { console.error('move-out form: office email failed', e) }
  return NextResponse.json({ ok: true, savedAt: now })
}
