// POST /api/landlord-onboarding/<id>/follow-up — chase a landlord we've asked for more (4 Nov 2026, Harry: "be able to
// send him an email follow up with the option of sending new management agreement too or just a request to find the
// missing docs required"). Body: { message, withAgreement, preview? } — preview returns the email as it would arrive and sends nothing.
//   message        — the email as written on the pipeline (plain text; paragraphs and • lines kept)
//   withAgreement  — attach the management agreement as it now stands: the one sent, with the landlord's own details
//                    from their form where you accepted them (the same PDF as "Preview final agreement" on the review)
// Always carries the button to their form, which stays open so they can add what's missing. Logged on the record
// (form_data.__followups) so the pipeline shows when you last chased and whether the agreement went.
// Sending the agreement here doesn't count as AML approval: verifying and "Approve & send" stay on the review.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { checkAgreement } from '@/lib/landlordOnboarding/agreementCheck'
import { generateManagementAgreementPDF } from '@/lib/managementAgreement/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { sendEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { senderFor } from '@/lib/email/sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const P = 'margin:0 0 16px;font-size:15px;color:#333;line-height:1.6'

/** plain text → email paragraphs; lines starting • or - become a list */
function html(message: string): string {
  return message.trim().split(/\n\s*\n/).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length && lines.every(l => /^[•\-*]\s*/.test(l)))
      return `<ul style="${P};padding-left:20px">${lines.map(l => `<li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('')}</ul>`
    const head = lines.filter(l => !/^[•\-*]\s*/.test(l)), items = lines.filter(l => /^[•\-*]\s*/.test(l))
    return `${head.length ? `<p style="${P}">${head.map(esc).join('<br>')}</p>` : ''}${items.length ? `<ul style="${P};padding-left:20px">${items.map(l => `<li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('')}</ul>` : ''}`
  }).join('\n')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const message = String(b.message ?? '').slice(0, 8000)
  if (!message.trim()) return NextResponse.json({ error: 'Write the email first' }, { status: 400 })
  if (/\[[^\]\n]{2,60}\]/.test(message)) return NextResponse.json({ error: 'The email still has [placeholders] to fill in. Nothing was sent.' }, { status: 400 })

  const { data: row } = await svc().from('landlord_onboarding').select('*').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const f = (row.form_data ?? {}) as Record<string, any>
  const recipients = Array.from(new Set([row.email, f.j_contact_email].filter(Boolean).map((e: string) => String(e).trim().toLowerCase())))
  if (!recipients.length) return NextResponse.json({ error: 'No email address on this record' }, { status: 400 })

  const formUrl = `${SITE}/landlord/onboard/${row.token}`
  const body = `${html(message)}
<p style="margin:0 0 22px"><a href="${formUrl}" style="display:inline-block;background:#1F3B2E;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">Open my registration form</a></p>`
  const subject = b.withAgreement ? 'Your Capital Rooms registration — a few details, and your management agreement' : 'Your Capital Rooms registration — a few details still needed'
  if (b.preview) {
    const check = b.withAgreement ? checkAgreement(f) : null
    if (b.withAgreement && !check?.updated) return NextResponse.json({ error: 'There’s no agreement on file for this landlord — make one on Agreements first.' }, { status: 400 })
    return NextResponse.json({ to: recipients, subject, html: await buildEmail(body, { sender: await senderFor(req) }), attachment: b.withAgreement ? `Capital-Rooms-management-agreement_${String(check!.updated!.properties?.[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}.pdf` : null })
  }

  let attachments: { filename: string; content: string }[] | undefined
  if (b.withAgreement) {
    const check = checkAgreement(f)
    if (!check.updated) return NextResponse.json({ error: 'There’s no agreement on file for this landlord — make one on Agreements first. Nothing was sent.' }, { status: 400 })
    try {
      const pdf = await generateManagementAgreementPDF({ ...check.updated, bizSettings: await fetchPDFBizSettings() })
      const slug = String(check.updated.properties?.[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
      attachments = [{ filename: `Capital-Rooms-management-agreement_${slug}.pdf`, content: pdf.toString('base64') }]
    } catch (err) {
      console.error('follow-up: agreement PDF failed', err)
      return NextResponse.json({ error: 'Couldn’t make the agreement PDF. Nothing was sent.' }, { status: 500 })
    }
  }

  const { ok, error } = await sendEmail(recipients, subject, body, { req, attachments })
  if (!ok) return NextResponse.json({ error: `Email failed: ${error ?? 'unknown'}. Nothing was sent.` }, { status: 502 })

  // log it — re-read just before writing so nothing the landlord saved in the meantime is overwritten
  const now = new Date().toISOString()
  const { data: fresh } = await svc().from('landlord_onboarding').select('form_data').eq('id', id).single()
  const fd = (fresh?.form_data ?? {}) as Record<string, any>
  const log = Array.isArray(fd.__followups) ? fd.__followups : []
  await svc().from('landlord_onboarding').update({ form_data: { ...fd, __followups: [...log, { at: now, by: admin.email, to: recipients, withAgreement: !!b.withAgreement }] }, updated_at: now }).eq('id', id)
  return NextResponse.json({ ok: true, to: recipients, attached: !!attachments })
}
