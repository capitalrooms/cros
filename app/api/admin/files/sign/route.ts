// POST /api/admin/files/sign { url } or { bucket, path } → { url } a link that works for 5 minutes.
// How the office opens files in private folders (a plain link can't carry the sign-in).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { parseStorageUrl } from '@/lib/files/paths'

export const dynamic = 'force-dynamic'
const BUCKETS = new Set(['inbox-docs', 'finance-docs', 'landlord-docs', 'property-documents', 'valuations', 'maintenance-photos', 'job-photos', 'property-photos'])

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const ref = b.url ? parseStorageUrl(b.url) : (b.bucket && b.path ? { bucket: String(b.bucket), path: String(b.path) } : null)
  if (!ref || !BUCKETS.has(ref.bucket) || ref.path.includes('..')) return NextResponse.json({ error: 'That file can’t be opened here' }, { status: 400 })
  const { data, error } = await createServiceClient().storage.from(ref.bucket).createSignedUrl(ref.path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message || 'File not found' }, { status: 404 })
  return NextResponse.json({ url: data.signedUrl })
}
