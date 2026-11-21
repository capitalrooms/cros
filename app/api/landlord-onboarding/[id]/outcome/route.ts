import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { sendEmail } from '@/lib/sendEmail'
import { onboardingName, dearFromText } from '@/lib/people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST { outcome: 'more_info' | 'docs_unverified', items: string[] } → tell the landlord, plainly, what is still needed.
// Says which items and nothing more. It is recorded on the form, and never changes the landlord's stage.
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const COPY = {
  more_info: {
    kind: 'aml-more-info',
    subject: 'We need a little more to finish your checks',
    intro: 'Thank you for providing the details. We need a little more before your checks can be completed:',
    close: 'Please reply to this email with these, and we will carry on from there.',
  },
  docs_unverified: {
    kind: 'aml-docs-unverified',
    subject: 'One or two of your documents could not be verified',
    intro: 'Thank you for providing the details. We were not able to verify the following document(s):',
    close: 'Please reply to this email with clearer copies, and we will check them again.',
  },
} as const

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { outcome?: string; items?: unknown }
  const copy = body.outcome === 'more_info' || body.outcome === 'docs_unverified' ? COPY[body.outcome] : null
  if (!copy) return NextResponse.json({ error: 'Choose what to tell the landlord' }, { status: 400 })
  const items = (Array.isArray(body.items) ? body.items : []).map(i => String(i).trim().slice(0, 300)).filter(Boolean).slice(0, 12)
  if (!items.length) return NextResponse.json({ error: 'Say what is needed, one item per line' }, { status: 400 })

  const { data: row } = await svc().from('landlord_onboarding').select('*').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const f = row.form_data ?? {}
  if (row.stage < 3 && !f.__submitted_at) return NextResponse.json({ error: 'The landlord has not submitted their form yet' }, { status: 400 })

  const recipients = Array.from(new Set([row.email, f.j_contact_email].filter(Boolean).map((e: string) => e.trim().toLowerCase())))
  const html = `
<p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.6">Dear ${esc(dearFromText(onboardingName(row)))},</p>
<p style="margin:0 0 10px;font-size:15px;color:#333;line-height:1.6">${esc(copy.intro)}</p>
<ul style="margin:0 0 16px;padding-left:18px;font-size:15px;color:#333;line-height:1.7">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">${esc(copy.close)}</p>
<p style="margin:24px 0 4px;font-size:15px;color:#333">Kind regards,</p>`

  const { ok, error } = await sendEmail(recipients, copy.subject, html, { kind: copy.kind, req })
  if (!ok) return NextResponse.json({ error: `Email failed: ${error ?? 'unknown'}` }, { status: 502 })

  const now = new Date().toISOString()
  const { error: saveErr } = await svc().from('landlord_onboarding').update({
    form_data: { ...f, __outcome: { type: body.outcome, items, sent_at: now } }, updated_at: now,
  }).eq('id', id)
  if (saveErr) return NextResponse.json({ error: `Email sent, but the record could not be updated: ${saveErr.message}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}
