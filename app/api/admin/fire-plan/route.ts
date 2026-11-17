// /api/admin/fire-plan — a property's fire evacuation plan as text (migration 292, lib/firePlan).
//   GET ?propertyId=            → { plan, updatedAt, docs }   docs = plans/drawings on file to fill from or show beside it
//   GET ?propertyId=&pdf=1[&drawing=<docId>]  → the printable landscape PDF
//   PUT { propertyId, plan }    → save
//   POST { propertyId, docId }  → read a plan on file and return its text (not saved until you press Save)
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { readFirePlan, renderFirePlanLandscape, EMPTY_PLAN, type FirePlan } from '@/lib/firePlan'
import { parseStorageUrl } from '@/lib/files/paths'

export const dynamic = 'force-dynamic'
export const maxDuration = 90
const clean = (p: any): FirePlan => {
  const arr = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map(x => String(x).trim()).filter(Boolean).slice(0, 15)
  return { address: p?.address ? String(p.address) : null, onDiscovery: arr(p?.onDiscovery), escapeRoutes: arr(p?.escapeRoutes), callForHelp: arr(p?.callForHelp), evacuate: arr(p?.evacuate), assemblyPoint: p?.assemblyPoint ? String(p.assemblyPoint).trim() || null : null, doNot: arr(p?.doNot), other: arr(p?.other) }
}
async function fileBytes(s: ReturnType<typeof createServiceClient>, docId: string) {
  const { data: d } = await s.from('property_documents').select('file_name, storage_url, property_id').eq('id', docId).maybeSingle() as { data: any }
  const ref = parseStorageUrl(d?.storage_url)
  if (!d || !ref) return null
  const { data } = await s.storage.from(ref.bucket).download(ref.path)
  if (!data) return null
  const bytes = Buffer.from(await data.arrayBuffer())
  const name = String(d.file_name ?? '').toLowerCase()
  const mime = name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  return { bytes, mime, propertyId: d.property_id as string }
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const propertyId = req.nextUrl.searchParams.get('propertyId') ?? ''
  const s = createServiceClient()
  const { data: p, error } = await s.from('properties').select('name, address, fire_plan, fire_plan_updated_at').eq('id', propertyId).maybeSingle() as { data: any; error: any }
  if (error) return NextResponse.json({ setupNeeded: /fire_plan/.test(error.message), plan: EMPTY_PLAN, docs: [] })
  const house = String(p?.name ?? p?.address ?? '').split('\n').join(', ')
  if (req.nextUrl.searchParams.get('pdf')) {
    const did = req.nextUrl.searchParams.get('drawing')
    const f = did ? await fileBytes(s, did) : null
    const pdf = await renderFirePlanLandscape(clean(p?.fire_plan ?? EMPTY_PLAN), house, f && f.mime !== 'application/pdf' && f.propertyId === propertyId ? f.bytes : null)
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Fire evacuation plan - ${house.split(',')[0].replace(/[^\w .-]/g, '')}.pdf"` } })
  }
  const { data: docs } = await s.from('property_documents').select('id, file_name, document_type, created_at').eq('property_id', propertyId).in('document_type', ['evacuation_plan', 'floor_plan', 'fire_risk_assessment']).order('created_at', { ascending: false }).limit(12)
  return NextResponse.json({ plan: p?.fire_plan ? clean(p.fire_plan) : EMPTY_PLAN, updatedAt: p?.fire_plan_updated_at ?? null, docs: docs ?? [] })
}

export async function PUT(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const { error } = await createServiceClient().from('properties').update({ fire_plan: clean(b.plan), fire_plan_updated_at: new Date().toISOString() }).eq('id', String(b.propertyId ?? ''))
  return error ? NextResponse.json({ error: /fire_plan/.test(error.message) ? 'Run migration 292 first.' : error.message }, { status: 400 }) : NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const f = await fileBytes(s, String(b.docId ?? ''))
  if (!f || f.propertyId !== b.propertyId) return NextResponse.json({ error: 'That file couldn’t be opened.' }, { status: 404 })
  return NextResponse.json({ plan: await readFirePlan(f.bytes, f.mime) })
}
