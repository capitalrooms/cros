// /api/admin/comms-properties — tenant messages per property (14 Nov 2026, Harry: "can't you turn on push notifications
// for this house alone?"). While the master switch (Settings › tenant messages) is paused, the properties on this list
// still get every automatic tenant message — approvals, bookings, "we're on our way", completions (lib/comms).
//   GET  ?propertyId=          → { master, on, properties: [{ id, name }] }
//   POST { propertyId, on }    → adds or removes it (administrators)
import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator, requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { getCommsLive, commsLiveProperties } from '@/lib/comms'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const list = await commsLiveProperties()
  const { data } = list.length ? await createServiceClient().from('properties').select('id, name').in('id', list) : { data: [] }
  const id = req.nextUrl.searchParams.get('propertyId')
  return NextResponse.json({ master: await getCommsLive(), on: !!id && list.includes(id), properties: data ?? [] })
}

export async function POST(req: NextRequest) {
  const me = await requireAdministrator(req)
  if (!me) return NextResponse.json({ error: 'Only administrators can change this.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const id = String(b.propertyId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which property?' }, { status: 400 })
  const list = new Set(await commsLiveProperties())
  if (b.on) list.add(id); else list.delete(id)
  const s = createServiceClient()
  const { error } = await s.from('system_settings').upsert({ key: 'comms_live_properties', value: JSON.stringify([...list]) }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit({ userId: me.personId, action: 'comms_property_switch', details: `${b.on ? 'On' : 'Off'} for property ${id}` } as any).catch(() => null)
  return NextResponse.json({ ok: true, on: !!b.on })
}
