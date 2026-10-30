// POST /api/landlord-onboarding/[id]/request-more { items: string[], note?: string } — "Ask for what's missing"
// (30 Oct 2026): emails the landlord the things they still need to send to pass the AML checks (worded by
// lib/landlordOnboarding/requests, ticked and edited by the office), reopens their form so they can add them, and
// keeps a record on the file. When they send the form again the checks run again and the office is told.
// Sanctions and PEP findings are never put in this email (tipping off) — the office handles those directly.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc, updateFormData } from '@/lib/landlordOnboarding/store'
import { sendEmail } from '@/lib/sendEmail'
import { PORTAL_URL } from '@/lib/emailWrapper'
import { onboardingName, dearFromText } from '@/lib/people'

export const dynamic = 'force-dynamic'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const items = (Array.isArray(b.items) ? b.items : []).map((x: unknown) => String(x ?? '').trim()).filter(Boolean).slice(0, 20)
  const note = String(b.note ?? '').trim().slice(0, 1000)
  if (!items.length) return NextResponse.json({ error: 'Tick at least one thing to ask for' }, { status: 400 })
  if (items.some((x: string) => /sanction|politically exposed|\bPEP\b/i.test(x)) || /sanction|politically exposed|\bPEP\b/i.test(note)) {
    return NextResponse.json({ error: 'Sanctions and PEP questions can’t go in this email — deal with those directly.' }, { status: 400 })
  }

  const { data: row } = await svc().from('landlord_onboarding').select('id, token, stage, verified_at, email, full_name, form_data').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const r = row as any
  if (!r.email) return NextResponse.json({ error: 'No email address on this record' }, { status: 400 })
  if (r.verified_at) return NextResponse.json({ error: 'This landlord is already verified' }, { status: 409 })

  // reopen the form (stage 3 → 2) so they can add documents, and keep the request on the file
  const now = new Date().toISOString()
  const result = await updateFormData(r.token, (current, cur) => {
    const asked = Array.isArray(current.__requests) ? (current.__requests as unknown[]) : []
    return { form_data: { ...current, __requests: [...asked, { at: now, by: admin.email, items, note: note || undefined }] }, extra: cur.stage === 3 ? { stage: 2 } : {} }
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const f = (r.form_data ?? {}) as Record<string, unknown>
  const dear = dearFromText(onboardingName(r) || r.full_name)
  const link = `${PORTAL_URL}/landlord/onboard/${r.token}`
  const html = `
<p style="margin:0 0 14px">Dear ${esc(dear)},</p>
<p style="margin:0 0 14px">Thank you for sending your details. To finish our checks${f.joint === 'yes' ? ' for you both' : ''}, we need a little more:</p>
<ul style="margin:0 0 16px;padding-left:20px">${items.map((x: string) => `<li style="margin:0 0 8px">${esc(x)}</li>`).join('')}</ul>
${note ? `<p style="margin:0 0 16px">${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
<p style="margin:0 0 18px">Your form is open again with everything you’ve already given us kept — just add these and send it back.</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#1b1a18;color:#ffffff;padding:13px 24px;border-radius:24px;text-decoration:none;font-weight:600">Add them to your form</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#6b6760">We ask for these because UK money-laundering rules require letting agents to confirm who their landlords are and that they own the property. Everything you send is stored securely and encrypted.</p>`
  const to = [r.email, typeof f.j_contact_email === 'string' && f.j_contact_email.includes('@') ? f.j_contact_email : null].filter(Boolean) as string[]
  const sent = await sendEmail(to, 'A few more things to finish your landlord checks', html, { req })
  if (!sent.ok) return NextResponse.json({ error: `The form was reopened but the email didn’t send: ${sent.error ?? 'unknown'}` }, { status: 502 })
  return NextResponse.json({ ok: true, to })
}
