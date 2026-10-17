// The landlord's whole new-tenant report as one PDF (/lu/<token>): our letterhead cover with the details we sent and a
// contents list, then every document that update shared (lib/landlordUpdates/report).
// The file is saved in private storage and the landlord is sent to a 5-minute download link — a report with a signed
// agreement runs to ~10 MB, and Vercel won't send a reply over 4.5 MB straight from the server (17 Oct 2026).
import { NextRequest, NextResponse } from 'next/server'
import { openUpdate, sharedDocs } from '@/lib/landlordUpdates/open'
import { buildTenantReport } from '@/lib/landlordUpdates/report'
import { STAGE_LABEL, type UpdateStage } from '@/lib/landlordUpdates/updates'
import { createServiceClient } from '@/lib/supabase'

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
  const fileName = `${name ? `${name} - ` : ''}New tenant report${place ? ` - ${place}` : ''}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ')
  const path = `tenant-reports/${u.id}.pdf`   // one file per update, replaced each time it's downloaded
  const store = createServiceClient().storage.from('landlord-docs')
  const up = await store.upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true })
  if (up.error) return NextResponse.json({ error: 'The report couldn’t be prepared. Please try again, or ask us for a copy.' }, { status: 500 })
  const { data } = await store.createSignedUrl(path, 300, { download: fileName })
  return data?.signedUrl ? NextResponse.redirect(data.signedUrl) : NextResponse.json({ error: 'The report couldn’t be prepared. Please try again, or ask us for a copy.' }, { status: 500 })
}
