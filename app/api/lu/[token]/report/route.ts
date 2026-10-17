// The landlord's whole new-tenant report as one PDF (/lu/<token>): our letterhead cover with the details we sent and a
// contents list, then every document that update shared (lib/landlordUpdates/report).
import { NextRequest, NextResponse } from 'next/server'
import { openUpdate, sharedDocs } from '@/lib/landlordUpdates/open'
import { buildTenantReport } from '@/lib/landlordUpdates/report'
import { STAGE_LABEL, type UpdateStage } from '@/lib/landlordUpdates/updates'
import { contentDisposition } from '@/lib/contentDisposition'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await openUpdate(token)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: o.status })
  const { s, u } = o
  const docs = await sharedDocs(s, u.doc_ids ?? [])
  const place = String(u.subject ?? '').split(' — ').slice(1).join(' — ')
  const name = (u.facts ?? []).find((f: any) => f.label === 'Full name')?.value
  const pdf = await buildTenantReport({
    title: u.stage === 'offer' ? 'Offer for your review' : name ? `New tenant report: ${name}` : STAGE_LABEL[u.stage as UpdateStage],
    place, facts: u.facts ?? [], docs: docs.map(d => ({ label: d.label, fileName: d.fileName, url: d.url })),
    sentOn: new Date(u.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }),
  })
  return new NextResponse(Buffer.from(pdf), { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition(`${name ? `${name} - ` : ''}New tenant report${place ? ` - ${place}` : ''}.pdf`, 'attachment'),
    'Cache-Control': 'private, no-store',
  } })
}
