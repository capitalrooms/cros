// GET /api/agreement/[token]          → what the landlord's review page shows (migration 253)
// GET /api/agreement/[token]?pdf=1    → redirects to a 5-minute link to the latest PDF (?download=1 to save it)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { agreementByToken } from '@/lib/managementAgreement/review'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const a = await agreementByToken((await params).token)
  if (!a) return NextResponse.json({ error: 'This link isn’t valid. Please reply to our email and we’ll send a new one.' }, { status: 404 })
  if (req.nextUrl.searchParams.get('pdf')) {
    const download = !!req.nextUrl.searchParams.get('download')
    const file = `Capital Rooms - ${a.agreement_type === 'rent_collection' ? 'Rent Collection' : 'Management'} Agreement.pdf`
    const { data, error } = await createServiceClient().storage.from('valuations').createSignedUrl(a.pdf_path, 300, download ? { download: file } : undefined)
    if (error || !data) return NextResponse.json({ error: 'The agreement could not be opened. Please try again.' }, { status: 500 })
    return NextResponse.redirect(data.signedUrl)
  }
  const rc = a.form?.rcTerms?.version === 'letting' ? 'Letting & Rent Collection Agreement' : 'Rent Collection Agreement'
  return NextResponse.json({
    title: a.agreement_type === 'rent_collection' ? rc : 'Management Agreement',
    clientName: a.client_name, properties: (a.properties ?? []).map((p: string) => p.split('\n').join(', ')),
    version: a.version, readyAt: a.ready_at,
  })
}
