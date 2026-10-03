/**
 * /api/emergencies/respond — the contractor's emergency link (/e/<token>). No sign-in: the token is the key.
 *   GET  ?token=…                         → what they may see (area only until they're confirmed)
 *   POST { token, answer: 'yes'|'no', etaAt?, fee?, note? }                    first answer
 *   POST { token, outcome, note?, part?, fixCost?, returnDate?, returnSlot?, newEta? }   after the visit
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { byToken, viewFor, respond, report, tick } from '@/lib/emergencies/engine'
import { TIME_SLOTS } from '@/lib/booking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const isoOrNull = (v: unknown) => { const d = new Date(String(v ?? '')); return isNaN(d.getTime()) ? null : d.toISOString() }

export async function GET(req: NextRequest) {
  const s = createServiceClient()
  await tick(s).catch(() => null)
  const got = await byToken(s, req.nextUrl.searchParams.get('token') ?? '')
  if (!got) return NextResponse.json({ error: 'This link has expired or isn’t right' }, { status: 404 })
  if (!got.r.opened_at) await s.from('emergency_responses').update({ opened_at: new Date().toISOString() }).eq('id', got.r.id)
  return NextResponse.json({ view: viewFor(got.r, got.em), slots: TIME_SLOTS })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const t = String(b.token ?? '')
  let out: any
  if (b.answer === 'yes' || b.answer === 'no') {
    const eta = isoOrNull(b.etaAt)
    if (b.answer === 'yes' && eta && new Date(eta).getTime() < Date.now() - 5 * 60000) return NextResponse.json({ error: 'That time has already passed' }, { status: 400 })
    out = await respond(s, t, { answer: b.answer, etaAt: eta, fee: b.fee === '' || b.fee == null ? null : Number(b.fee), note: String(b.note ?? '') })
  } else if (['on_site', 'fixed', 'made_safe', 'not_fixed', 'running_late', 'cant_attend'].includes(b.outcome)) {
    out = await report(s, t, {
      outcome: b.outcome, note: String(b.note ?? ''), part: String(b.part ?? ''),
      fixCost: b.fixCost === '' || b.fixCost == null ? null : Number(b.fixCost),
      returnDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.returnDate ?? '')) ? b.returnDate : null,
      returnSlot: TIME_SLOTS.some(x => x.value === b.returnSlot) ? b.returnSlot : null,
      newEta: isoOrNull(b.newEta),
    })
  } else return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  if (out?.error) return NextResponse.json(out, { status: 400 })
  const got = await byToken(s, t)
  return NextResponse.json({ ...out, view: got ? viewFor(got.r, got.em) : null })
}
