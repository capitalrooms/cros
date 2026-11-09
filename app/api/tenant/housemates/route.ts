// The signed-in tenant's housemates (9 Nov 2026): everyone living at the same house now (co-tenants too), first names
// and rooms only, with the profiles they chose to share — photo (short signed link), avatar, bio and answers.
// Never rent, contact details or surnames.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.role !== 'tenant') return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient() as any
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const live = (q: any) => q.is('let_cancelled_at', null).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  const { data: mine } = await live(s.from('tenancies').select('property_id, properties(name)').or(`person_id.eq.${c.personId},co_tenant_id.eq.${c.personId}`)).order('start_date', { ascending: false }).limit(1).maybeSingle()
  if (!mine) return NextResponse.json({ house: null, me: c.personId, housemates: [] })
  const { data: tens } = await live(s.from('tenancies').select('person_id, co_tenant_id, rooms(name)').eq('property_id', mine.property_id))
  const rooms = new Map<string, string | null>()
  for (const t of (tens ?? []) as any[]) for (const id of [t.person_id, t.co_tenant_id]) if (id && !rooms.has(id)) rooms.set(id, t.rooms?.name ?? null)
  const ids = [...rooms.keys()]
  const [{ data: people }, { data: ibs }] = await Promise.all([
    s.from('people').select('id, first_name').in('id', ids),
    s.from('tenant_icebreakers').select('person_id, answers, visible_to_housemates').in('person_id', ids),
  ])
  const prof = new Map<string, any>(((ibs ?? []) as any[]).map(i => [i.person_id, i]))
  const housemates = await Promise.all(ids.map(async id => {
    const p = prof.get(id); const isMe = id === c.personId
    const shown = isMe || (p && p.visible_to_housemates !== false)
    const answers = shown ? { ...(p?.answers ?? {}) } : {}
    let photoUrl: string | null = null
    if (answers.photo) { const { data: sg } = await s.storage.from('property-documents').createSignedUrl(String(answers.photo), 3600); photoUrl = sg?.signedUrl ?? null }
    delete answers.photo
    const person = ((people ?? []) as any[]).find(x => x.id === id)
    return { personId: id, isMe, name: person?.first_name || 'A housemate', roomName: rooms.get(id) ?? null, photoUrl, answers }
  }))
  return NextResponse.json({ house: mine.properties?.name ?? null, me: c.personId, housemates })
}
