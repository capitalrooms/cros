// The appliances in a house (migration 268 — lib/house/snap). Office only.
//   GET ?propertyId=          → { ready, appliances }
//   PATCH { id, location?, visible?, brand?, model?, kind? }
//   DELETE ?id=               → taken off the list (kept on record with removed_at)
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { APPLIANCE_KINDS } from '@/lib/house/snap'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('propertyId') ?? ''
  const { data, error } = await createServiceClient().from('property_appliances').select('*').eq('property_id', id).is('removed_at', null).order('kind')
  if (error) return NextResponse.json({ ready: !/property_appliances|does not exist|schema cache/i.test(error.message), appliances: [] })
  return NextResponse.json({ ready: true, appliances: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('location' in b) upd.location = String(b.location ?? '').slice(0, 80) || null
  if ('visible' in b) upd.visible_to_tenants = !!b.visible
  if ('brand' in b) upd.brand = String(b.brand ?? '').slice(0, 60) || null
  if ('model' in b) upd.model = String(b.model ?? '').slice(0, 60) || null
  if ('kind' in b && APPLIANCE_KINDS[b.kind]) upd.kind = b.kind
  const { error } = await createServiceClient().from('property_appliances').update(upd).eq('id', String(b.id))
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await createServiceClient().from('property_appliances').update({ removed_at: new Date().toISOString() }).eq('id', req.nextUrl.searchParams.get('id') ?? '')
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
