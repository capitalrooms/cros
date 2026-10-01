import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { checkAgreement } from '@/lib/landlordOnboarding/agreementCheck'
import { generateManagementAgreementPDF } from '@/lib/managementAgreement/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { sendEmail } from '@/lib/sendEmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

// POST → AML review signed off: send the landlord(s) confirmation plus the final management
// agreement (updated with their confirmed details), ready for digital signature.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { data: row } = await svc().from('landlord_onboarding').select('*').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const f = row.form_data ?? {}
  if (row.stage < 3) return NextResponse.json({ error: 'The landlord has not submitted their form yet' }, { status: 400 })
  if (!f.__decision) return NextResponse.json({ error: 'Record your risk assessment decision first' }, { status: 400 })
  if (f.__decision.risk_level === 'high' && body.confirm_high !== true) {
    return NextResponse.json({ error: 'This client is rated HIGH risk — confirm that enhanced due diligence is complete and senior approval given before sending' }, { status: 409 })
  }

  const check = checkAgreement(f)
  if (!check.updated) return NextResponse.json({ error: 'No management agreement on file to update — generate one from the Management Agreement page' }, { status: 400 })
  const pdf = await generateManagementAgreementPDF({ ...check.updated, bizSettings: await fetchPDFBizSettings() })

  const storagePath = `management-agreements/${crypto.randomUUID()}.pdf`
  await svc().storage.from('valuations').upload(storagePath, pdf, { contentType: 'application/pdf', upsert: false }).catch(() => null)

  const recipients = Array.from(new Set([row.email, f.j_contact_email].filter(Boolean).map((e: string) => e.trim().toLowerCase())))
  const changes = check.diffs.length
    ? `<p style="margin:0 0 8px;font-size:15px;color:#333;line-height:1.6">I have updated the agreement with the details you confirmed:</p>
       <ul style="margin:0 0 18px;padding-left:18px;font-size:14px;color:#333;line-height:1.7">${check.diffs.map(d => `<li><strong>${esc(d.field)}:</strong> ${esc(d.fromLandlord)}</li>`).join('')}</ul>`
    : `<p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.6">The details you confirmed match your agreement, so no changes were needed.</p>`
  const prop = (check.updated.properties?.[0] ?? '').replace(/\n/g, ', ')
  const kind = check.updated.agreementType === 'rent_collection' ? 'rent collection' : 'management'
  const html = `
<p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.6">Dear ${esc(row.full_name)},</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Thank you for completing your registration. We have now reviewed your information and documents, and your identity and anti-money laundering checks are <strong>complete</strong>.</p>
${changes}
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Your final ${kind} agreement${prop ? ` for <strong>${esc(prop)}</strong>` : ''} is attached for your records. Please have a read through — if anything needs changing, just reply to this email.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">When you are ready, reply to let me know and I will send the agreement for your electronic signature through our signing software. Once it is signed, we can get started.</p>
<p style="margin:24px 0 4px;font-size:15px;color:#333">Kind regards,</p>`
  const slug = (prop || 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
  const { ok, error } = await sendEmail(recipients, `Your checks are complete — your final ${kind} agreement`, html, {
    req,
    attachments: [{ filename: `Capital-Rooms-${kind === 'management' ? 'Management' : 'Rent-Collection'}-Agreement_${slug}_final.pdf`, content: pdf.toString('base64') }],
  })
  if (!ok) return NextResponse.json({ error: `Email failed: ${error ?? 'unknown'}` }, { status: 502 })

  const now = new Date().toISOString()
  const history = [...((f.__agreement_history as unknown[]) ?? []), f.__agreement]
  const { error: saveErr } = await svc().from('landlord_onboarding').update({
    form_data: {
      ...f,
      __agreement: { ...check.updated, sent_at: now, version: (f.__agreement?.version ?? 1) + 1, pdf_path: storagePath },
      __agreement_history: history,
    },
    stage: Math.max(row.stage, 4), verified_at: row.verified_at ?? now, approval_sent_at: now, updated_at: now,
  }).eq('id', id)
  if (saveErr) return NextResponse.json({ error: `Email sent, but the record could not be updated: ${saveErr.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, sentTo: recipients, changes: check.diffs.length })
}
