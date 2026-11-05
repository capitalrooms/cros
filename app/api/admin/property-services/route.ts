/**
 * /api/admin/property-services — a property's bills & services (migration 264, lib/properties/services).
 *   GET  ?propertyId=                    → { ready, services (with what's been paid), suggestions }
 *   POST { propertyId, service }         → add (service.id → update)
 *   POST { action: 'end', id }           → the account was closed or moved (kept for the record)
 *   POST { action: 'delete', id }        → removed (a mistake)
 * Saving an internet account rewrites the WiFi item in the house information the tenant app shows.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { servicesFor, syncHouseInfo, SERVICE_KINDS, WHO_PAYS } from '@/lib/properties/services'

export const dynamic = 'force-dynamic'
const SETUP = 'Run migration 264 in Supabase first (bills & services) — then refresh.'
const missing = (e: { message?: string } | null) => !!e && /property_services|does not exist|schema cache/i.test(e.message ?? '')
const txt = (v: unknown, n = 200) => { const t = String(v ?? '').trim().slice(0, n); return t || null }
const date = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('propertyId')
  if (!id) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  return NextResponse.json(await servicesFor(createServiceClient(), id))
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()

  if (b.action === 'end' || b.action === 'delete') {
    const { data: row } = await s.from('property_services').select('property_id, kind').eq('id', b.id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { error } = b.action === 'end'
      ? await s.from('property_services').update({ ended_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', b.id)
      : await s.from('property_services').delete().eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const v = b.service ?? {}
  if (!b.propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  if (!SERVICE_KINDS.some(k => k.key === v.kind)) return NextResponse.json({ error: 'Choose what it is for' }, { status: 400 })
  const cost = v.monthly_cost === '' || v.monthly_cost == null ? null : Number(v.monthly_cost)
  if (cost != null && !(cost >= 0 && cost < 100000)) return NextResponse.json({ error: 'Enter the monthly cost in £, or leave it blank' }, { status: 400 })
  const email = txt(v.login_email, 160)
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'The login email doesn’t look right' }, { status: 400 })
  const row = {
    property_id: b.propertyId, kind: v.kind, supplier: txt(v.supplier, 120), account_number: txt(v.account_number, 80), account_holder: txt(v.account_holder, 120),
    login_email: email, support_phone: txt(v.support_phone, 40), who_pays: WHO_PAYS.some(w => w.key === v.who_pays) ? v.who_pays : 'we_recharge',
    payment_method: txt(v.payment_method, 60), monthly_cost: cost, contract_start: date(v.contract_start), contract_end: date(v.contract_end),
    meter_refs: txt(v.meter_refs, 300), wifi_network: v.kind === 'internet' ? txt(v.wifi_network, 80) : null, wifi_password: v.kind === 'internet' ? txt(v.wifi_password, 80) : null,
    notes: txt(v.notes, 1000), updated_at: new Date().toISOString(),
  }
  const { error } = v.id
    ? await s.from('property_services').update(row).eq('id', v.id).eq('property_id', b.propertyId)
    : await s.from('property_services').insert({ ...row, created_by: admin.personId })
  if (missing(error)) return NextResponse.json({ error: SETUP }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (v.kind === 'internet') await syncHouseInfo(s, b.propertyId)   // the tenants' WiFi details, from this account
  return NextResponse.json({ ok: true })
}
