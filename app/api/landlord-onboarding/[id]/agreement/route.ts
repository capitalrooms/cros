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

// POST { reject: string[] } → which of the landlord's changes NOT to use (keys from GET); the rest go into the final
// agreement. Kept on the record so the preview, the approval and the saved agreement all match.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const reject = (Array.isArray(body.reject) ? body.reject : []).filter((k: unknown) => typeof k === 'string' && /^[a-z_]{2,40}$/.test(k))
  const { data: row } = await svc().from('landlord_onboarding').select('form_data').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await svc().from('landlord_onboarding').update({ form_data: { ...(row.form_data ?? {}), __agreement_reject: reject }, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const check = checkAgreement({ ...(row.form_data ?? {}), __agreement_reject: reject })
  return NextResponse.json({ ok: true, hasSnapshot: check.hasSnapshot, diffs: check.diffs })
}
