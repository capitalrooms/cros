import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { checkAgreement } from '@/lib/landlordOnboarding/agreementCheck'
import { generateManagementAgreementPDF } from '@/lib/managementAgreement/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → differences between the agreement as sent and what the landlord confirmed.
// GET ?pdf=1 → the updated agreement PDF (preview before sending).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data: row } = await svc().from('landlord_onboarding').select('form_data').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const check = checkAgreement(row.form_data ?? {})
  if (req.nextUrl.searchParams.get('pdf') !== '1') return NextResponse.json({ hasSnapshot: check.hasSnapshot, diffs: check.diffs })
  if (!check.updated) return NextResponse.json({ error: 'No agreement on file for this record' }, { status: 404 })
  const pdf = await generateManagementAgreementPDF({ ...check.updated, bizSettings: await fetchPDFBizSettings() })
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Management Agreement - updated (preview).pdf"' },
  })
}
