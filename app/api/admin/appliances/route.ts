// The appliances in a house (migration 268 — lib/house/snap). Office only.
//   GET ?propertyId=          → { ready, appliances }
//   POST { propertyId, kind, brand?, model?, location? } → added by hand (no label photo needed) — 10 Nov 2026
//   PATCH { id, location?, visible?, brand?, model?, kind? }
//   PATCH { id, guideAction: 'approve', guide? } — the office checked the care guide (and may have edited it): tenants
//         and the fault-reporting AI use it from now · { id, guideAction: 'discard' } · { id, guideAction: 'research' }
//   DELETE ?id=               → taken off the list (kept on record with removed_at)
import { NextRequest, NextResponse, after } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { APPLIANCE_KINDS } from '@/lib/house/snap'
import { researchAndSave } from '@/lib/house/careGuide'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('propertyId') ?? ''
  const { data, error } = await createServiceClient().from('property_appliances').select('*').eq('property_id', id).is('removed_at', null).order('kind')
  if (error) return NextResponse.json({ ready: !/property_appliances|does not exist|schema cache/i.test(error.message), appliances: [] })
  return NextResponse.json({ ready: true, appliances: data ?? [] })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const propertyId = String(b.propertyId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || !APPLIANCE_KINDS[b.kind]) return NextResponse.json({ error: 'Pick what kind of appliance it is.' }, { status: 400 })
  const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n) || null
  const { data, error } = await createServiceClient().from('property_appliances').insert({
    property_id: propertyId, kind: b.kind, brand: clip(b.brand, 60), model: clip(b.model, 60), location: clip(b.location, 80),
    visible_to_tenants: true, added_by: caller.email ?? null,
  }).select('id').single()
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, id: (data as any).id })
}

export async function PATCH(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  if (b.guideAction === 'research') {
    after(() => researchAndSave(s as any, String(b.id)))
    await s.from('property_appliances').update({ guide_status: 'researching', guide_at: new Date().toISOString() }).eq('id', String(b.id))
    return NextResponse.json({ ok: true })
  }
  if (b.guideAction === 'approve' || b.guideAction === 'discard') {
    const { error } = await s.from('property_appliances').update(b.guideAction === 'approve'
      ? { ...(b.guide && typeof b.guide === 'object' ? { guide: b.guide } : {}), guide_status: 'approved', guide_approved_at: new Date().toISOString(), guide_approved_by: caller.email ?? null }
      : { guide: null, guide_status: null, guide_approved_at: null, guide_approved_by: null }).eq('id', String(b.id))
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('location' in b) upd.location = String(b.location ?? '').slice(0, 80) || null
  if ('visible' in b) upd.visible_to_tenants = !!b.visible
  if ('brand' in b) upd.brand = String(b.brand ?? '').slice(0, 60) || null
  if ('model' in b) upd.model = String(b.model ?? '').slice(0, 60) || null
  if ('kind' in b && APPLIANCE_KINDS[b.kind]) upd.kind = b.kind
  const { error } = await s.from('property_appliances').update(upd).eq('id', String(b.id))
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await createServiceClient().from('property_appliances').update({ removed_at: new Date().toISOString() }).eq('id', req.nextUrl.searchParams.get('id') ?? '')
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
