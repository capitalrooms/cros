// One document shared on a landlord's private page (/lu/<token>): a signed link that works for 5 minutes, and only
// for documents that update shared, while its link hasn't expired.
import { NextRequest, NextResponse } from 'next/server'
import { signedLinkFor } from '@/lib/files/server'
import { openUpdate } from '@/lib/landlordUpdates/open'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params
  const o = await openUpdate(token)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: o.status })
  if (!(o.u.doc_ids ?? []).includes(docId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: d } = await o.s.from('property_documents').select('storage_url').eq('id', docId).maybeSingle() as { data: any }
  const link = await signedLinkFor(d?.storage_url, 300)
  return link ? NextResponse.redirect(link) : NextResponse.json({ error: 'That document couldn’t be opened. Please ask us for a copy.' }, { status: 404 })
}
