// /api/tenant/emergency — the tenant's own emergency screen (15 Nov 2026, Harry: "Alice needs to see her report in her app
// clearly and see what to do in the meantime … she can also say whether they have managed to find a solution for it
// until morning"). Anyone living at the house sees it — never the contractor's name or number.
//   GET            → { items: [tenantView] }  open ones at my property (or ?id= for one, open or closed)
//   POST { id, action: 'contained' | 'worse' | 'arrived' | 'no_show', note? }
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { tenantView, tenantAction, tickIfStale } from '@/lib/emergencies/engine'
import { firstNameForTenants } from '@/lib/jobs/tenantQuestion'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function myProperties(s: ReturnType<typeof createServiceClient>, personId: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data } = await s.from('tenancies').select('property_id').or(`person_id.eq.${personId},co_tenant_id.eq.${personId}`)
    .is('let_cancelled_at', null).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  return [...new Set(((data ?? []) as any[]).map(t => t.property_id).filter(Boolean))] as string[]
}
// the booked contractor's first name, for the tenant ("Ricky, our emergency contractor")
async function withContractor(s: ReturnType<typeof createServiceClient>, em: any) {
  if (!em?.chosen_response_id) return em
  const { data: r } = await s.from('emergency_responses').select('people!contractor_id(salutation, first_name, last_name, full_name, company)').eq('id', em.chosen_response_id).maybeSingle() as { data: any }
  const first = firstNameForTenants(r?.people)
  return { ...em, contractorFirst: first === 'Your contractor' ? null : first }
}
const SELECT = 'id, ticket_id, kind, title, details, status, controlled, eta_at, chosen_response_id, created_at, property_id, reporter_id, properties(name)'

export async function GET(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const s = createServiceClient()
  await tickIfStale(s)   // the scheduler has stopped? opening this screen keeps the emergency moving
  const props = await myProperties(s, me.personId)
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const { data: em } = await s.from('emergencies').select(SELECT).eq('id', id).maybeSingle() as { data: any }
    if (!em || !(props.includes(em.property_id) || em.reporter_id === me.personId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ item: tenantView(await withContractor(s, em)) })
  }
  if (!props.length) return NextResponse.json({ items: [] })
  const since = new Date(Date.now() - 3 * 86400000).toISOString()
  const { data } = await s.from('emergencies').select(SELECT).in('property_id', props).gte('created_at', since)
    .not('status', 'in', '(resolved,cancelled)').order('created_at', { ascending: false }) as { data: any[] | null }
  return NextResponse.json({ items: await Promise.all((data ?? []).map(async e => tenantView(await withContractor(s, e)))) })
}

export async function POST(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { id?: string; action?: string; note?: string }
  if (!['contained', 'worse', 'arrived', 'no_show', 'sorted', 'not_fixed'].includes(String(b.action))) return NextResponse.json({ error: 'Unknown choice' }, { status: 400 })
  const s = createServiceClient()
  const { data: em } = await s.from('emergencies').select('id, property_id, reporter_id').eq('id', String(b.id ?? '')).maybeSingle() as { data: any }
  const props = await myProperties(s, me.personId)
  if (!em || !(props.includes(em.property_id) || em.reporter_id === me.personId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: p } = await s.from('people').select('first_name, last_name, full_name').eq('id', me.personId).maybeSingle() as { data: any }
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || 'A tenant'
  const out = await tenantAction(s, em.id, { personId: me.personId, name }, b.action as 'contained' | 'worse' | 'arrived' | 'no_show' | 'sorted' | 'not_fixed', b.note)
  return 'error' in out ? NextResponse.json(out, { status: 400 }) : NextResponse.json(out)
}
