// GET /api/tenant/documents          — the signed-in tenant's documents (lib/tenant/documents)
// GET /api/tenant/documents?open=<id> — { url } a 5-minute private link to one of them, or the statement of account PDF
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireSignedIn } from '@/lib/portalAuth'
import { tenantDocuments, PACK_BUCKET } from '@/lib/tenant/documents'
import { signedLinkFor } from '@/lib/files/server'
import { DOCS_BUCKET } from '@/lib/documents/generated'
import { tenantAccount } from '@/lib/finance/tenantAccount'
import { renderTenantAccountPdf } from '@/lib/finance/tenantAccountPdf'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const { docs, sources } = await tenantDocuments(s, me.personId, me.email)
  const open = req.nextUrl.searchParams.get('open')
  if (!open) return NextResponse.json({ documents: docs })

  const src = sources.get(open)
  if (!src) return NextResponse.json({ error: 'That document isn’t available.' }, { status: 404 })
  if (src.kind === 'statement') {
    const acc = await tenantAccount(s, src.tenancyId)
    if (!acc) return NextResponse.json({ error: 'Your statement couldn’t be made.' }, { status: 404 })
    const pdf = await renderTenantAccountPdf(acc)
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition('Statement of account.pdf', 'inline') } })
  }
  let url: string | null = null
  if (src.kind === 'pack') url = (await s.storage.from(PACK_BUCKET).createSignedUrl(src.path, 300)).data?.signedUrl ?? null
  else if (src.kind === 'gd') url = (await s.storage.from(DOCS_BUCKET).createSignedUrl(src.path, 300)).data?.signedUrl ?? null
  else url = await signedLinkFor(src.url, 300)
  if (!url) return NextResponse.json({ error: 'That document couldn’t be opened — please tell us.' }, { status: 404 })
  return NextResponse.json({ url })
}
