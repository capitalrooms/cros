import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTemplate, render } from '@/lib/messageTemplate'
import { sendEmail } from '@/lib/sendEmail'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cros-sigma.vercel.app'

// ── GET /api/landlord-onboarding  → list all records ──────────────────────────
export async function GET() {
  const { data, error } = await svc()
    .from('landlord_onboarding')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data })
}

// ── POST /api/landlord-onboarding  → create + send welcome pack ────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { full_name: full_name_or_name, email, phone, created_by } = body

  if (!full_name_or_name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  // Insert new row at stage 1
  const { data: row, error } = await svc()
    .from('landlord_onboarding')
    .insert({ full_name: full_name_or_name.trim(), email: email.trim(), phone: phone?.trim() || null, created_by: created_by || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send welcome pack email
  const formUrl = `${BASE_URL}/landlord/onboard/${row.token}`
  let emailSent = false
  let emailError: string | undefined

  const onboardTpl = await getTemplate('landlord-onboarding-welcome')
  const firstName = full_name_or_name.trim().split(' ')[0]
  const welcomeSubject = onboardTpl?.subject_line
    ? render(onboardTpl.subject_line, { first_name: firstName })
    : 'Welcome to Capital Rooms — Getting Started'

  try {
    const { ok, error: sendErr } = await sendEmail(email.trim(), welcomeSubject, welcomePackBodyHtml(full_name_or_name.trim(), formUrl))
    if (!ok) throw new Error(sendErr ?? 'Email failed')
    emailSent = true

    // Advance to stage 2 and record sent time
    await svc()
      .from('landlord_onboarding')
      .update({ stage: 2, welcome_sent_at: new Date().toISOString() })
      .eq('id', row.id)

    row.stage = 2
  } catch (e) {
    emailError = e instanceof Error ? e.message : 'Email failed'
  }

  return NextResponse.json({ row, emailSent, emailError })
}

// ── Welcome pack body HTML (wrapper applied automatically by sendEmail) ────────

function welcomePackBodyHtml(name: string, formUrl: string): string {
  return `
<p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">Dear ${name},</p>

<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
  Thank you for your interest in Capital Rooms. We are delighted to have the opportunity to discuss our management services
  for your property and look forward to building a long-term relationship with you.
</p>

<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
  As part of our onboarding process, we are required to verify your identity and confirm your ownership of the property
  in accordance with our Anti-Money Laundering obligations. This is a standard requirement for all new landlord clients
  and is completed once only.
</p>

<p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.6">
  Please use the link below to complete our secure landlord information form. The process takes approximately
  10–15 minutes and can be completed at your convenience — no account or login is required.
</p>

<div style="margin:0 0 32px;">
  <a href="${formUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:14px;font-weight:600;padding:14px 28px;border-radius:6px;text-decoration:none;letter-spacing:0.3px;">
    Complete Your Landlord Information Form →
  </a>
</div>

<p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6">
  If you have any questions at any stage, please do not hesitate to contact us directly at
  <a href="mailto:management@capitalrooms.co.uk" style="color:#1a1a1a">management@capitalrooms.co.uk</a>.
</p>

<p style="margin:24px 0 4px;font-size:15px;color:#333">Kind regards,</p>
<p style="margin:0;font-size:15px;color:#333;font-weight:600">The Capital Rooms Team</p>`
}
