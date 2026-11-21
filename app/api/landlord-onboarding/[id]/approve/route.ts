import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { sendEmail } from '@/lib/sendEmail'
import { onboardingName, dearFromText } from '@/lib/people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST → the office has confirmed the AML checks passed. Tells the landlord (and the joint landlord, if any) that
// their checks are complete. Nothing is signed and no agreement is attached: an agreement is only ever sent by its
// own deliberate step (send-with-agreement), never automatically from here (21 Nov 2026).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { data: row } = await svc().from('landlord_onboarding').select('*').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const f = row.form_data ?? {}
  // a form submitted once counts even when it's been reopened to ask for more (4 Nov 2026: Mr Rislan)
  if (row.stage < 3 && !f.__submitted_at) return NextResponse.json({ error: 'The landlord has not submitted their form yet' }, { status: 400 })
  if (!f.__decision) return NextResponse.json({ error: 'Record your risk assessment decision first' }, { status: 400 })
  if (f.__decision.risk_level === 'high' && body.confirm_high !== true) {
    return NextResponse.json({ error: 'This client is rated HIGH risk — confirm that enhanced due diligence is complete and senior approval given before sending' }, { status: 409 })
  }

  const recipients = Array.from(new Set([row.email, f.j_contact_email].filter(Boolean).map((e: string) => e.trim().toLowerCase())))
  const html = `
<p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.6">Dear ${esc(dearFromText(onboardingName(row)))},</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Thank you for providing the details. Your identity and anti-money laundering checks have <strong>passed</strong>.</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Nothing else is needed from you for now. We will be in touch if anything changes.</p>
<p style="margin:24px 0 4px;font-size:15px;color:#333">Kind regards,</p>`

  const { ok, error } = await sendEmail(recipients, 'Your checks have passed', html, { kind: 'aml-passed', req })
  if (!ok) return NextResponse.json({ error: `Email failed: ${error ?? 'unknown'}` }, { status: 502 })

  const now = new Date().toISOString()
  const { error: saveErr } = await svc().from('landlord_onboarding').update({
    form_data: { ...f, __outcome: { type: 'passed', items: [], sent_at: now } },
    stage: Math.max(row.stage, 4), verified_at: row.verified_at ?? now, approval_sent_at: now, updated_at: now,
  }).eq('id', id)
  if (saveErr) return NextResponse.json({ error: `Email sent, but the record could not be updated: ${saveErr.message}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
