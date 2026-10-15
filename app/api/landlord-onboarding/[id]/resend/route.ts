// POST → send the landlord their registration form link again (Harry, 13 Oct 2026: "the option to resend an email
// for onboarding … as Mohammad needs to get the email again"), with the agreement attached again when one was sent.
// Body: { email? } — a corrected address to use (and keep) from now on.
// Only while the form is still open (not yet submitted); their progress is kept, so they carry on where they left off.
import { NextRequest, NextResponse } from 'next/server'
import { dearFromText } from '@/lib/people'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { generateManagementAgreementPDF } from '@/lib/managementAgreement/generatePDF'
import { rentCollectionTermsFrom } from '@/lib/managementAgreement/rentCollectionTerms'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { sendEmail } from '@/lib/sendEmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
/** "Mr Rislan" — lib/people dearFromText (never a lone first name) */
const greeting = (full: string) => dearFromText(full)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { data: row } = await svc().from('landlord_onboarding').select('*').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.stage >= 3) return NextResponse.json({ error: 'They have already submitted their form — open it to review, or ask them to use “Reopen my form” on their link to change anything' }, { status: 409 })

  const newEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return NextResponse.json({ error: 'That email address doesn’t look right' }, { status: 400 })
  const email = newEmail || String(row.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'No email address on this record' }, { status: 400 })
  const f = (row.form_data ?? {}) as Record<string, any>
  const recipients = Array.from(new Set([email, f.j_contact_email].filter(Boolean).map((e: string) => String(e).trim().toLowerCase())))

  // the agreement as last sent, attached again
  const a = f.__agreement
  let attachments: { filename: string; content: string }[] | undefined
  let kind = ''
  if (a?.properties?.length) {
    const isRC = a.agreementType === 'rent_collection'
    kind = isRC ? (rentCollectionTermsFrom(a.rentCollection).version === 'letting' ? 'letting and rent collection' : 'rent collection') : 'management'
    try {
      const pdf = await generateManagementAgreementPDF({ ...a, bizSettings: await fetchPDFBizSettings() })
      const slug = String(a.properties[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
      attachments = [{ filename: `Capital-Rooms-${kind.replace(/ /g, '-')}-agreement_${slug}.pdf`, content: pdf.toString('base64') }]
    } catch { attachments = undefined }
  }

  const formUrl = `${SITE}/landlord/onboard/${row.token}`
  const started = Array.isArray(f.__sections_saved) && f.__sections_saved.length > 0
  const html = `
<p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.6">Dear ${esc(greeting(String(row.full_name ?? '')))},</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">As requested, here is the link to your Capital Rooms landlord registration form again.${started ? ' Everything you have entered so far is saved, so you can carry on where you left off.' : ''}</p>
<p style="margin:0 0 22px"><a href="${formUrl}" style="display:inline-block;background:#181614;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">Open my registration form</a></p>
${attachments ? `<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Your ${kind} agreement is attached again. If any of your details in it aren’t quite right — names, addresses or your bank account — just give the correct ones in the form and we’ll update the agreement to match before you sign.</p>` : ''}
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">If you are providing information for anyone else — a co-owner, a family member or someone you act for — you can add them and their contact details in the form. You can also add other contacts for your account, such as your accountant.</p>
<p style="margin:24px 0 4px;font-size:15px;color:#333">Kind regards,</p>`

  const { ok, error } = await sendEmail(recipients, 'Your Capital Rooms registration form — link inside', html, { req, attachments })
  if (!ok) return NextResponse.json({ error: `Email failed: ${error ?? 'unknown'}` }, { status: 502 })

  const now = new Date().toISOString()
  await svc().from('landlord_onboarding').update({
    // only the record's address — never their saved answers, which they may be editing at this moment
    ...(newEmail && newEmail !== String(row.email ?? '').toLowerCase() ? { email: newEmail } : {}),
    stage: Math.max(row.stage ?? 1, 2), welcome_sent_at: now, updated_at: now,
  }).eq('id', id)
  return NextResponse.json({ ok: true, sentTo: recipients, attached: !!attachments })
}
