// GET  /api/tenant/feedback — the house this tenant lives in and when they last sent us feedback
// POST /api/tenant/feedback — { ratings: {area: 1-5}, comments: {area: text}, anything_else } for their current house
// Answers go to the office only (tenant_feedback, migration 237).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn } from '@/lib/portalAuth'
import { FEEDBACK_AREAS } from '@/lib/feedback/areas'
import { insertNotifications } from '@/lib/serverNotify'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

async function currentHome(s: ReturnType<typeof svc>, personId: string) {
  const today = ukToday()
  const { data } = await s.from('tenancies').select('id, property_id, properties(name, address)')
    .or(`person_id.eq.${personId},co_tenant_id.eq.${personId}`).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false }).limit(1).maybeSingle()
  return data as any
}

export async function GET(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = svc()
  const home = await currentHome(s, me.personId)
  if (!home) return NextResponse.json({ house: null })
  const { data: last } = await s.from('tenant_feedback').select('created_at').eq('person_id', me.personId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ house: home.properties?.name || String(home.properties?.address ?? '').split(/\n|,/)[0], lastSentAt: last?.created_at ?? null })
}

export async function POST(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = svc()
  const home = await currentHome(s, me.personId)
  if (!home) return NextResponse.json({ error: 'We couldn’t find a house you live in now.' }, { status: 400 })

  const b = await req.json().catch(() => ({}))
  const keys = new Set(FEEDBACK_AREAS.map(a => a.key))
  const ratings: Record<string, number> = {}
  const comments: Record<string, string> = {}
  for (const [k, v] of Object.entries(b.ratings ?? {})) if (keys.has(k) && [1, 2, 3, 4, 5].includes(Number(v))) ratings[k] = Number(v)
  for (const [k, v] of Object.entries(b.comments ?? {})) { const t = String(v ?? '').trim().slice(0, 1000); if (keys.has(k) && t) comments[k] = t }
  const anything = String(b.anything_else ?? '').trim().slice(0, 3000) || null
  if (!Object.keys(ratings).length && !Object.keys(comments).length && !anything) return NextResponse.json({ error: 'Score at least one area first.' }, { status: 400 })

  const { error } = await s.from('tenant_feedback').insert({ property_id: home.property_id, person_id: me.personId, tenancy_id: home.id, ratings, comments, anything_else: anything })
  if (error) return NextResponse.json({ error: /does not exist|schema cache/.test(error.message) ? 'Feedback isn’t switched on yet — please try again later.' : `Couldn’t save your answers: ${error.message}` }, { status: 500 })

  // the office sees it come in
  const { data: office } = await s.from('people').select('id').in('role', ['administrator', 'admin'])
  const house = home.properties?.name || 'a house'
  await insertNotifications(s, ((office ?? []) as any[]).map(p => p.id), { title: `New tenant feedback — ${house}`, body: 'A tenant has filled in the feedback form.', type: 'admin', link: `/admin/feedback?property=${home.property_id}` }, { propertyId: home.property_id })
  return NextResponse.json({ ok: true })
}
