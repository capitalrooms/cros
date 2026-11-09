// /api/admin/inspections?propertyId= — a property's inspections + its repair approval limit (9 Nov 2026, migration 275). Office only.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { DEFAULT_AREAS, setupError, signPhotos, landlordEmails } from '@/lib/inspections'

export const dynamic = 'force-dynamic'
const pid = (req: NextRequest, b?: any) => String(b?.propertyId ?? req.nextUrl.searchParams.get('propertyId') ?? '')
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = pid(req)
  if (!UUID.test(id)) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  const s = createServiceClient() as any
  const [{ data, error }, { data: p }] = await Promise.all([
    s.from('property_inspections').select('id, kind, inspected_on, inspected_by, overall, summary, areas, status, token, sent_at, sent_to, viewed_at, created_at').eq('property_id', id).order('inspected_on', { ascending: false }).limit(50),
    s.from('properties').select('repair_approval_limit').eq('id', id).maybeSingle(),
  ])
  const msg = setupError(error)
  if (msg) return NextResponse.json({ error: msg, inspections: [], limit: null, landlordEmails: await landlordEmails(s, id) }, { status: 200 })
  return NextResponse.json({ inspections: data ?? [], photos: await signPhotos(data ?? []), limit: p?.repair_approval_limit ?? null, landlordEmails: await landlordEmails(s, id) })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const id = pid(req, b)
  if (!UUID.test(id)) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  const kind = ['routine', 'check_in', 'check_out', 'other'].includes(b.kind) ? b.kind : 'routine'
  const s = createServiceClient() as any
  const { data: me } = admin.personId ? await s.from('people').select('first_name, last_name').eq('id', admin.personId).maybeSingle() : { data: null }
  const { data, error } = await s.from('property_inspections').insert({
    property_id: id, kind, inspected_on: new Date().toISOString().slice(0, 10),
    inspected_by: [me?.first_name, me?.last_name].filter(Boolean).join(' ') || null,
    areas: DEFAULT_AREAS.map(name => ({ name, condition: null, note: '', photos: [] })), created_by: admin.personId ?? null,
  }).select('id').single()
  const msg = setupError(error)
  if (msg) return NextResponse.json({ error: msg }, { status: 400 })
  return NextResponse.json({ id: data.id })
}

/** The repair approval limit: a number of pounds, or blank for none. */
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const id = pid(req, b)
  if (!UUID.test(id)) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  const v = b.repair_approval_limit === '' || b.repair_approval_limit == null ? null : Number(b.repair_approval_limit)
  if (v != null && (!isFinite(v) || v < 0)) return NextResponse.json({ error: 'Enter the limit in pounds, or leave it blank for none.' }, { status: 400 })
  const { error } = await (createServiceClient() as any).from('properties').update({ repair_approval_limit: v }).eq('id', id)
  const msg = setupError(error)
  if (msg) return NextResponse.json({ error: msg }, { status: 400 })
  return NextResponse.json({ ok: true, limit: v })
}
