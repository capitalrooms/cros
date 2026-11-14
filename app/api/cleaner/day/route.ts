// /api/cleaner/day — what the cleaner's Today screen needs beyond the cleans themselves (14 Nov 2026, Garden Ask):
//   GET   ?cleanIds=a,b&propertyIds=x,y → { requests: [{ cleanId, property, room, location, tasks, notes }],
//                                          supplies: [{ id, propertyId, property, item, reportedAt }] }
//         · requests: what tenants asked for on these cleans (cleaner_extras_requests), with the asker's room and where
//           it is in the house (rooms.location_in_house) — so "Room 2 asked" says which room and how to find it
//         · supplies: what's running low at these houses (property_supplies, migration 289) — tapped in by cleaners
//   POST  { propertyId, item }  → a cleaner says something's running low (the office is told, to restock)
//   PATCH { id }                → restocked
// Cleaners (and the office). Never tenants' surnames or contact details.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { insertNotifications } from '@/lib/serverNotify'

export const dynamic = 'force-dynamic'
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ids = (v: string | null) => (v ?? '').split(',').filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 30)
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const allowed = (c: any) => !!c && (c.role === 'cleaner' || isStaff(c))

export async function GET(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!allowed(c)) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = svc()
  const cleanIds = ids(req.nextUrl.searchParams.get('cleanIds')), propertyIds = ids(req.nextUrl.searchParams.get('propertyIds'))
  // only this cleaner's own cleans
  const { data: cleans } = cleanIds.length ? await s.from('cleans').select('id, property_id, cleaner_id, properties(name)').in('id', cleanIds) : { data: [] as any[] }
  const mine = ((cleans ?? []) as any[]).filter(x => isStaff(c) || x.cleaner_id === c!.personId)
  const { data: reqs } = mine.length ? await s.from('cleaner_extras_requests').select('clean_id, person_id, tasks, notes').in('clean_id', mine.map(x => x.id)) : { data: [] as any[] }
  const people = [...new Set(((reqs ?? []) as any[]).map(r => r.person_id).filter(Boolean))]
  const t = today()
  const { data: tens } = people.length ? await s.from('tenancies').select('person_id, co_tenant_id, property_id, rooms(name, location_in_house)').or(`person_id.in.(${people.join(',')}),co_tenant_id.in.(${people.join(',')})`).is('let_cancelled_at', null).lte('start_date', t).or(`end_date.is.null,end_date.gte.${t}`) : { data: [] as any[] }
  const requests = ((reqs ?? []) as any[]).filter(r => (r.tasks?.length || r.notes)).map(r => {
    const cl = mine.find(x => x.id === r.clean_id)
    const ten = ((tens ?? []) as any[]).find(x => (x.person_id === r.person_id || x.co_tenant_id === r.person_id) && x.property_id === cl?.property_id)
    return { cleanId: r.clean_id, property: cl?.properties?.name ?? '', room: ten?.rooms?.name ?? null, location: ten?.rooms?.location_in_house ?? null, tasks: (r.tasks ?? []).map((x: any) => typeof x === 'string' ? x : x?.text ?? x?.label).filter(Boolean), notes: r.notes ?? null }
  })
  const { data: sup, error } = propertyIds.length ? await s.from('property_supplies').select('id, property_id, item, reported_at, properties(name)').in('property_id', propertyIds).is('restocked_at', null).order('reported_at', { ascending: false }) : { data: [] as any[], error: null }
  const supplies = error ? [] : ((sup ?? []) as any[]).map(x => ({ id: x.id, propertyId: x.property_id, property: x.properties?.name ?? '', item: x.item, reportedAt: x.reported_at }))
  return NextResponse.json({ requests, supplies, suppliesReady: !error })
}

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!allowed(c) || c!.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const propertyId = String(b.propertyId ?? ''), item = String(b.item ?? '').trim().slice(0, 60)
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || !item) return NextResponse.json({ error: 'Say what’s running low.' }, { status: 400 })
  const s = svc()
  const { data: open } = await s.from('property_supplies').select('id').eq('property_id', propertyId).ilike('item', item).is('restocked_at', null).limit(1)
  if (open?.length) return NextResponse.json({ ok: true, already: true })
  const { error } = await s.from('property_supplies').insert({ property_id: propertyId, item, reported_by: c!.personId })
  if (error) return NextResponse.json({ error: /does not exist|schema cache/i.test(error.message) ? 'Supplies switch on once the office runs the latest update.' : error.message }, { status: 500 })
  const { data: p } = await s.from('properties').select('name').eq('id', propertyId).maybeSingle() as { data: any }
  const { data: admins } = await s.from('people').select('id').eq('role', 'administrator')
  await insertNotifications(s as any, ((admins ?? []) as any[]).map(a => a.id), { title: `${item} running low at ${p?.name ?? 'a property'}`, body: 'The cleaner flagged it — restock before the next clean.', type: 'admin', link: `/admin/properties/${propertyId}` } as any).catch(() => null)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!allowed(c) || c!.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const { error } = await svc().from('property_supplies').update({ restocked_at: new Date().toISOString(), restocked_by: c!.personId }).eq('id', String(b.id ?? ''))
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
