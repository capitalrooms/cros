import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { generateOnboardingAMLReport } from '@/lib/aml/onboardingReport'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { contentDisposition } from '@/lib/contentDisposition'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → the Customer Due Diligence record PDF for this onboarding.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data: row } = await svc().from('landlord_onboarding').select('*').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const f = row.form_data ?? {}
  const pdf = await generateOnboardingAMLReport({
    onboardingId: row.id, clientName: row.full_name, email: row.email, createdAt: row.created_at,
    submittedAt: f.__submitted_at ?? row.docs_received_at, form: f, review: f.__review ?? null, decision: f.__decision ?? null,
    biz: await fetchPDFBizSettings(),
  })
  const safe = String(row.full_name).replace(/[^a-zA-Z0-9 &'-]/g, '').trim()
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`CDD Record - ${safe}.pdf`, 'attachment') },
  })
}
