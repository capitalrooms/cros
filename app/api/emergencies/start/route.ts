/**
 * /api/emergencies/start — called by the tenant's report screen when they choose Emergency.
 *   POST { ticketId, kind?, controlled? } → { id, status }
 * Only the person who reported it, or someone living at that property, can start one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { startEmergency } from '@/lib/emergencies/engine'
import { KINDS, kindFrom, type EmergencyKind } from '@/lib/emergencies/guide'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const caller = await requireSignedIn(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: t } = await s.from('maintenance_tickets').select('id, property_id, reporter_id, description, category').eq('id', String(b.ticketId ?? '')).maybeSingle() as { data: any }
  if (!t) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data: lives } = await s.from('tenancies').select('id').eq('person_id', caller.personId).eq('property_id', t.property_id).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`).limit(1)
  const office = ['administrator', 'admin'].includes(caller.role)
  if (!office && !lives?.length && t.reporter_id !== caller.userId && t.reporter_id !== caller.personId) return NextResponse.json({ error: 'Not your property' }, { status: 403 })
  const kind: EmergencyKind = KINDS[b.kind as EmergencyKind] ? b.kind : kindFrom(String(t.description ?? ''), String(t.category ?? ''))
  try {
    const out = await startEmergency(s, { ticketId: t.id, kind, controlled: !!b.controlled, reporterId: caller.personId })
    if ('error' in out && out.error) return NextResponse.json(out, { status: 400 })
    return NextResponse.json(out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not start it'
    return NextResponse.json({ error: /does not exist|schema cache/.test(msg) ? 'Emergencies aren’t set up yet (migration 203)' : msg }, { status: 500 })
  }
}
