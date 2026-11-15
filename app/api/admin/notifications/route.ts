// /api/admin/notifications — who gets what, in one place (14 Nov 2026, Harry: "we have too many places to go to simply
// control what and who gets notifications"). Administrators.
//   GET  → { tenants: { master, elected, emergencyUpdates, properties: [{ id, name, on }] },
//            landlords: [{ id, name, on, onApp }], workers: [{ id, name, role, push, email, sms, onApp }],
//            office: [{ id, name, role, onApp }], prefs: { [personId]: { push, email, sms, onApp, landlordOn } } }
//   POST { type: 'setting', key: 'comms_live'|'elected_comms_live'|'emergency_tenant_updates', value: boolean }
//        { type: 'property', id, on }
//        { type: 'landlord', id, on }                          → people.landlord_comms_enabled
//        { type: 'person', id, field: 'push'|'email'|'sms', on } → people.notify_by_*
import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { getCommsLive, getElectedCommsLive, commsLiveProperties } from '@/lib/comms'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
const name = (p: any) => [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company || p.email || '—'

export async function GET(req: NextRequest) {
  if (!(await requireAdministrator(req))) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const s = createServiceClient()
  const [master, elected, list, { data: props }, { data: people }, { data: subs }, { data: em }] = await Promise.all([
    getCommsLive(), getElectedCommsLive(), commsLiveProperties(),
    s.from('properties').select('id, name, is_demo'),
    s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, role, notify_by_push, notify_by_email, notify_by_sms, landlord_comms_enabled').in('role', ['tenant', 'landlord', 'contractor', 'cleaner', 'administrator', 'admin', 'lettings']),
    s.from('push_subscriptions').select('person_id'),
    s.from('system_settings').select('value').eq('key', 'emergency_tenant_updates').maybeSingle(),
  ]) as any[]
  const onApp = new Set(((subs ?? []) as any[]).map(x => x.person_id))
  const ppl = (people ?? []) as any[]
  const az = (a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })
  return NextResponse.json({
    tenants: {
      master, elected, emergencyUpdates: (em as any)?.value !== 'false',
      properties: ((props ?? []) as any[]).map(p => ({ id: p.id, name: p.is_demo ? `${p.name} (practice)` : p.name, on: list.includes(p.id) })).sort(az),
    },
    landlords: ppl.filter(p => p.role === 'landlord').map(p => ({ id: p.id, name: name(p), on: p.landlord_comms_enabled === true, onApp: onApp.has(p.id) })).sort(az),
    workers: ppl.filter(p => ['contractor', 'cleaner'].includes(p.role)).map(p => ({ id: p.id, name: name(p), role: p.role, push: p.notify_by_push !== false, email: p.notify_by_email !== false, sms: p.notify_by_sms !== false, onApp: onApp.has(p.id) })).sort(az),
    office: ppl.filter(p => ['administrator', 'admin', 'lettings'].includes(p.role)).map(p => ({ id: p.id, name: name(p), role: p.role, onApp: onApp.has(p.id) })).sort(az),
    // every contact's own switches, for the Contacts list (15 Nov 2026): id → { push, email, sms, onApp, landlordOn }
    prefs: Object.fromEntries(ppl.map(p => [p.id, { push: p.notify_by_push !== false, email: p.notify_by_email !== false, sms: p.notify_by_sms !== false, onApp: onApp.has(p.id), landlordOn: p.landlord_comms_enabled === true }])),
  })
}

export async function POST(req: NextRequest) {
  const me = await requireAdministrator(req)
  if (!me) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const id = String(b.id ?? '')
  let what = ''
  if (b.type === 'setting') {
    if (!['comms_live', 'elected_comms_live', 'emergency_tenant_updates'].includes(b.key)) return NextResponse.json({ error: 'Unknown setting' }, { status: 400 })
    const { error } = await s.from('system_settings').upsert({ key: b.key, value: b.value ? 'true' : 'false' }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    what = `${b.key} → ${b.value ? 'on' : 'off'}`
  } else if (b.type === 'property') {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which property?' }, { status: 400 })
    const list = new Set(await commsLiveProperties())
    if (b.on) list.add(id); else list.delete(id)
    const { error } = await s.from('system_settings').upsert({ key: 'comms_live_properties', value: JSON.stringify([...list]) }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    what = `tenant messages ${b.on ? 'on' : 'off'} for property ${id}`
  } else if (b.type === 'landlord' || b.type === 'person') {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Who?' }, { status: 400 })
    const col = b.type === 'landlord' ? 'landlord_comms_enabled' : ({ push: 'notify_by_push', email: 'notify_by_email', sms: 'notify_by_sms' } as Record<string, string>)[b.field]
    if (!col) return NextResponse.json({ error: 'Unknown choice' }, { status: 400 })
    const { error } = await s.from('people').update({ [col]: !!b.on }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    what = `${col} → ${b.on ? 'on' : 'off'} for ${id}`
  } else return NextResponse.json({ error: 'Unknown change' }, { status: 400 })
  await logAudit({ userId: me.personId, action: 'notification_settings', details: what } as any).catch(() => null)
  return NextResponse.json({ ok: true })
}
