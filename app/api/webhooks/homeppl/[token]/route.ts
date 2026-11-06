// Homeppl tells us when a referencing check moves on (6 Nov 2026 — subscription topics validation.updated /
// validation.completed). Homeppl doesn't sign its webhooks, so:
//   · the address carries a secret made from our API key (lib/homeppl/client webhookToken) — a wrong one gets 404
//   · nothing in the message is believed: we only take check ids from it and ask Homeppl ourselves, with our key
//   · the tenancy is found by the email Homeppl has for that check; no tenancy yet (still an applicant) → nothing happens
// Then the letting file is brought up to date exactly as the "Bring documents into CROS" button does (lib/homeppl/sync).
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { hp, homepplReady, webhookToken } from '@/lib/homeppl/client'
import { bringInFromHomeppl } from '@/lib/homeppl/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!homepplReady() || !same(token, webhookToken())) return new NextResponse(null, { status: 404 })
  const raw = (await req.text()).slice(0, 200_000)
  const ids = [...new Set(raw.match(UUID) ?? [])].slice(0, 6)
  const s = createServiceClient()
  const done: string[] = []
  for (const id of ids) {
    // is it an applicant's check? (a guarantor's or an application's id simply isn't found — the applicant's own
    // check sends its own message)
    const v = await hp(`/api/v3/validations/${id}/`).then(r => r.json()).catch(() => null)
    const email = String(v?.email ?? v?.applicant?.email ?? '').trim().toLowerCase()
    if (!email) continue
    const { data: people } = await s.from('people').select('id').ilike('email', email.replace(/[\\%_]/g, m => `\\${m}`)).limit(3)
    if (!people?.length) continue
    const { data: t } = await s.from('tenancies').select('id').in('person_id', people.map((p: any) => p.id)).is('let_cancelled_at', null).order('start_date', { ascending: false }).limit(1).maybeSingle()
    if (!t) continue
    try { await bringInFromHomeppl(s, (t as any).id, 'Homeppl'); done.push((t as any).id) }
    catch (e: any) { console.warn('homeppl webhook:', e?.message) }
  }
  return NextResponse.json({ ok: true, updated: done.length })
}
