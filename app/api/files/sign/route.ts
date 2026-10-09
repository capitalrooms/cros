// POST /api/files/sign { urls: string[] } → { links: { [url]: signedUrl | null } } — short-lived (10 min) links to
// stored files for whoever is signed in, and only the files they may see (9 Oct 2026, private folders):
//   office staff        — any file in these folders
//   tenant              — documents shared with their house (visible to tenants) or filed on their own tenancy;
//                         photos on repair jobs at their house; the tenant guides
//   contractor          — photos on jobs assigned to them
// Anything else comes back null. Used by screens through lib/files/useStoredFile (a plain link can't carry the sign-in).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { parseStorageUrl } from '@/lib/files/paths'

export const dynamic = 'force-dynamic'
const SECONDS = 600
const BUCKETS = new Set(['property-documents', 'maintenance-photos', 'job-photos', 'tenant-guides', 'inbox-docs', 'finance-docs', 'landlord-docs', 'valuations', 'property-photos'])
const PHOTO_BUCKETS = new Set(['maintenance-photos', 'job-photos'])

export async function POST(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const urls: string[] = (Array.isArray(b.urls) ? b.urls : b.url ? [b.url] : []).filter((u: unknown) => typeof u === 'string').slice(0, 100)
  const s = createServiceClient()
  const staff = isStaff(me)

  // what a tenant or contractor is connected to (looked up once)
  let myTenancyIds = new Set<string>(), myPropertyIds = new Set<string>()
  if (!staff && me.role === 'tenant') {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await s.from('tenancies').select('id, property_id, end_date, let_cancelled_at').eq('person_id', me.personId)
    for (const t of (data ?? []) as any[]) {
      if (t.let_cancelled_at) continue
      myTenancyIds.add(t.id)
      if (!t.end_date || t.end_date >= today) myPropertyIds.add(t.property_id)
    }
  }

  // the repair job a photo belongs to: filed under the job's id, else listed on the job (photos added by the office
  // before the job existed go under new/…), else attached to it
  const jobFor = async (ref: { path: string }, url: string, cols: string): Promise<any> => {
    const first = ref.path.split('/')[0]
    if (/^[0-9a-f-]{36}$/i.test(first)) {
      const { data } = await s.from('maintenance_tickets').select(cols).eq('id', first).maybeSingle()
      if (data) return data
    }
    for (const col of ['photos', 'before_photo', 'after_photo']) {
      const q = col === 'photos' ? s.from('maintenance_tickets').select(cols).contains('photos', [url]) : s.from('maintenance_tickets').select(cols).eq(col, url)
      const { data } = await q.limit(1)
      if (data?.length) return data[0]
    }
    const { data: att } = await s.from('attachments').select('ticket_id').eq('storage_url', url).limit(1)
    if (att?.length) { const { data } = await s.from('maintenance_tickets').select(cols).eq('id', (att[0] as any).ticket_id).maybeSingle(); return data }
    return null
  }

  const links: Record<string, string | null> = {}
  for (const url of urls) {
    links[url] = null
    const ref = parseStorageUrl(url)
    if (!ref || ref.path.includes('..') || !BUCKETS.has(ref.bucket)) continue
    let ok = staff
    if (!ok && me.role === 'tenant') {
      if (ref.bucket === 'tenant-guides') ok = myTenancyIds.size > 0
      else if (ref.bucket === 'property-documents') {
        const { data: doc } = await s.from('property_documents').select('property_id, tenancy_id, visible_to_tenants').eq('storage_url', url).maybeSingle() as { data: any }
        ok = !!doc && ((doc.tenancy_id && myTenancyIds.has(doc.tenancy_id)) || (doc.visible_to_tenants && myPropertyIds.has(doc.property_id)))
      } else if (PHOTO_BUCKETS.has(ref.bucket)) {
        const job = await jobFor(ref, url, 'property_id, reporter_id')
        ok = !!job && (job.reporter_id === me.personId || myPropertyIds.has(job.property_id))
      }
    }
    if (!ok && me.role === 'contractor' && PHOTO_BUCKETS.has(ref.bucket)) {
      const job = await jobFor(ref, url, 'contractor_id')
      ok = !!job && job.contractor_id === me.personId
    }
    if (!ok) continue
    const { data } = await s.storage.from(ref.bucket).createSignedUrl(ref.path, SECONDS)
    links[url] = data?.signedUrl ?? null
  }
  return NextResponse.json({ links })
}
