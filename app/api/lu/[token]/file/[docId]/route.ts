// One document shared on a landlord's private page (/lu/<token>): a signed link that works for 5 minutes, and only for
// documents that update shared, while its link hasn't expired. ?download=1 saves it instead of showing it.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseStorageUrl } from '@/lib/files/paths'
import { openUpdate, sharedDocs } from '@/lib/landlordUpdates/open'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params
  const o = await openUpdate(token)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: o.status })
  if (!(o.u.doc_ids ?? []).includes(docId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [d] = await sharedDocs(o.s, [docId])
  const ref = parseStorageUrl(d?.url)
  if (!d || !ref) return d?.url ? NextResponse.redirect(d.url) : NextResponse.json({ error: 'That document couldn’t be opened. Please ask us for a copy.' }, { status: 404 })
  const download = req.nextUrl.searchParams.get('download') === '1'
  const { data } = await createServiceClient().storage.from(ref.bucket).createSignedUrl(ref.path, 300, download ? { download: d.fileName || true } : undefined)
  return data?.signedUrl ? NextResponse.redirect(data.signedUrl) : NextResponse.json({ error: 'That document couldn’t be opened. Please ask us for a copy.' }, { status: 404 })
}
