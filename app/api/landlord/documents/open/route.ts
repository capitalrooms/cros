// GET /api/landlord/documents/open?type=pd|gd|ls&id=…[&download=1] — one of the landlord's documents.
//   pd / gd → { url } (a private link for 5 minutes) · ls → the lettings statement PDF, made now
// Only ever the landlord's own (ownsDoc). 21 Oct 2026.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseStorageUrl } from '@/lib/files/paths'
import { DOCS_BUCKET } from '@/lib/documents/generated'
import { lettingsStatementFor } from '@/lib/lettingsStatement/forTenancy'
import { landlordFor, ownsDoc } from '@/lib/landlord/documents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const landlord = await landlordFor(req)
  if (!landlord) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const type = req.nextUrl.searchParams.get('type') ?? '', id = req.nextUrl.searchParams.get('id') ?? ''
  const download = req.nextUrl.searchParams.get('download') === '1'
  const s = createServiceClient() as any
  if (!(await ownsDoc(s, landlord, type, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const sorry = NextResponse.json({ error: 'That document couldn’t be opened — please ask us for a copy.' }, { status: 404 })

  if (type === 'ls') {
    const r = await lettingsStatementFor(s, id)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    return new NextResponse(new Uint8Array(r.buffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${r.filename}"` } })
  }
  if (type === 'pd') {
    const { data: d } = await s.from('property_documents').select('file_name, storage_url').eq('id', id).maybeSingle()
    const ref = parseStorageUrl(d?.storage_url)
    if (!ref) return d?.storage_url ? NextResponse.json({ url: d.storage_url }) : sorry
    const { data } = await s.storage.from(ref.bucket).createSignedUrl(ref.path, 300, download ? { download: d.file_name || true } : undefined)
    return data?.signedUrl ? NextResponse.json({ url: data.signedUrl }) : sorry
  }
  const { data: g } = await s.from('generated_documents').select('storage_path, number, kind').eq('id', id).maybeSingle()
  if (!g?.storage_path) return sorry
  const { data } = await s.storage.from(DOCS_BUCKET).createSignedUrl(g.storage_path, 300, download ? { download: `${g.kind === 'invoice' ? 'Invoice' : 'Letter'}-${g.number ?? id.slice(0, 8)}.pdf` } : undefined)
  return data?.signedUrl ? NextResponse.json({ url: data.signedUrl }) : sorry
}
