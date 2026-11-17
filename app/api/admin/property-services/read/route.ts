// /api/admin/property-services/read — drop bills, letters or screenshots on a house's Bills & services tab.
//   POST multipart { propertyId, serviceId?, files[] }  or  JSON { propertyId, serviceId?, docIds[] } (bills already on file)
//   → files kept on the house (Documents, type utility_bill; tagged to the account when serviceId is given) and
//     { docIds, found } — the details on them, for you to check and accept. Nothing on the account changes until Save.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { parseStorageUrl } from '@/lib/files/paths'
import { readBill, tagFor } from '@/lib/properties/serviceDocs'

export const dynamic = 'force-dynamic'
export const maxDuration = 90
const safe = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-80)
const mimeOf = (name: string, t?: string) => t || (/\.pdf$/i.test(name) ? 'application/pdf' : /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg')

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const files: { bytes: Buffer; mime: string }[] = []
  const docIds: string[] = []
  let propertyId = '', serviceId = ''
  if ((req.headers.get('content-type') ?? '').includes('multipart')) {
    const f = await req.formData()
    propertyId = String(f.get('propertyId') ?? ''); serviceId = String(f.get('serviceId') ?? '')
    for (const v of f.getAll('files')) {
      if (!(v instanceof File) || !v.size) continue
      if (v.size > 15_000_000) return NextResponse.json({ error: `${v.name} is too big (15 MB most)` }, { status: 400 })
      const bytes = Buffer.from(await v.arrayBuffer()), mime = mimeOf(v.name, v.type)
      if (!/pdf|image\//.test(mime)) return NextResponse.json({ error: `${v.name}: send a PDF or a picture` }, { status: 400 })
      const path = `bills/${propertyId}/${Date.now()}-${safe(v.name)}`
      const up = await s.storage.from('property-documents').upload(path, bytes, { contentType: mime, upsert: false })
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
      const url = s.storage.from('property-documents').getPublicUrl(path).data.publicUrl
      const { data: doc, error } = await s.from('property_documents').insert({ property_id: propertyId, document_type: 'utility_bill', file_name: v.name, storage_url: url, file_size: v.size, description: serviceId ? tagFor(serviceId) : 'Bills & services', uploaded_by: admin.personId, visible_to_tenants: false }).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      docIds.push(doc.id); files.push({ bytes, mime })
    }
  } else {
    const b = await req.json().catch(() => ({}))
    propertyId = String(b.propertyId ?? ''); serviceId = String(b.serviceId ?? '')
    const { data } = await s.from('property_documents').select('id, file_name, storage_url').eq('property_id', propertyId).in('id', (b.docIds ?? []).slice(0, 6))
    for (const d of (data ?? []) as any[]) {
      const ref = parseStorageUrl(d.storage_url); if (!ref) continue
      const { data: blob } = await s.storage.from(ref.bucket).download(ref.path); if (!blob) continue
      files.push({ bytes: Buffer.from(await blob.arrayBuffer()), mime: mimeOf(d.file_name) }); docIds.push(d.id)
    }
  }
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  if (!files.length) return NextResponse.json({ error: 'No files to read' }, { status: 400 })
  const { data: p } = await s.from('properties').select('name').eq('id', propertyId).maybeSingle() as { data: any }
  try {
    const found = await readBill(files, String(p?.name ?? '').split('\n')[0])
    return NextResponse.json({ docIds, found })
  } catch (e: any) {
    return NextResponse.json({ docIds, found: null, error: `Kept the file${files.length > 1 ? 's' : ''}, but couldn’t read ${files.length > 1 ? 'them' : 'it'}: ${e?.message ?? 'error'}` })
  }
}
