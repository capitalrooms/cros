import { requireAdmin } from '@/lib/adminAuth'
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
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await svc()
    .from('landlord_onboarding')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data })
}

// ── POST /api/landlord-onboarding  → create + send welcome pack ────────────────
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { full_name: full_name_or_name, email, phone, created_by } = body

  if (!full_name_or_name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  // Insert new row at stage 1
  const { data: row, error } = await svc()
    .from('landlord_onboarding')
    .insert({
      full_name: full_name_or_name.trim(), email: email.trim(), phone: phone?.trim() || null, created_by: created_by || null,
      // the name as the office typed it, ready in the landlord's own form
      ...(body.first_name ? { form_data: { salutation: String(body.salutation || '').slice(0, 10), first_name: String(body.first_name).slice(0, 80), last_name: String(body.last_name || '').slice(0, 80) } } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send welcome pack email
  const formUrl = `${BASE_URL}/landlord/onboard/${row.token}`
  let emailSent = false
  let emailError: string | undefined

  const onboardTpl = await getTemplate('landlord-onboarding-welcome')
  const firstName = String(body.first_name || full_name_or_name.trim().split(' ')[0])
  const welcomeSubject = onboardTpl?.subject_line
    ? render(onboardTpl.subject_line, { first_name: firstName })
    : 'Welcome to Capital Rooms — Getting Started'

  try {
    const { ok, error: sendErr } = await sendEmail(
      email.trim(),
      welcomeSubject,
      welcomePackBodyHtml(full_name_or_name.trim(), formUrl),
      { req }
    )
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
  const firstName = name.split(' ')[0]
  return `
<p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">Dear ${name},</p>

<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
  Thank you for choosing Capital Rooms. We are looking forward to managing your property. This email contains
  everything you need to get started, including your terms of engagement — please read it in full.
</p>

<!-- Management Agreement -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
  <tr>
    <td style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:8px;padding:20px 24px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.08em;">📋 Your Management Agreement</p>
      <p style="margin:0 0 12px;font-size:14px;color:#333;line-height:1.6">
        Our management agreement sets out the full scope of our services, your fees, and our mutual obligations.
        Please take the time to read it before completing the information below.
      </p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6">
        <strong>Management fee:</strong> 10% of rent collected (HMO) or 8% (single let)<br>
        <strong>Let fee:</strong> £300 per room / £500 for single let<br>
        <strong>Maintenance float:</strong> Held to authorise urgent works under £500<br>
        <strong>Notice period:</strong> 2 months written notice by either party
      </p>
    </td>
  </tr>
</table>

<!-- What to do next -->
<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1a1a1a;">What happens next</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
  <tr>
    <td style="padding:0 0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="36" valign="top" style="padding-top:2px;">
            <div style="width:26px;height:26px;background:#1a1a1a;border-radius:50%;text-align:center;line-height:26px;font-size:12px;font-weight:700;color:#fff;">1</div>
          </td>
          <td style="padding-left:12px;">
            <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1a1a1a;">Complete your landlord information</p>
            <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">
              Our secure online form collects your identity, property ownership, and banking details for our Anti-Money Laundering compliance.
              You can save your progress at any time and return to it later — no login required.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="36" valign="top" style="padding-top:2px;">
            <div style="width:26px;height:26px;background:#1a1a1a;border-radius:50%;text-align:center;line-height:26px;font-size:12px;font-weight:700;color:#fff;">2</div>
          </td>
          <td style="padding-left:12px;">
            <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1a1a1a;">Sign the management agreement</p>
            <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">
              Once your information is verified (usually 1–2 working days) we will send the finalised management agreement
              for your electronic signature via Adobe Sign.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<div style="margin:0 0 32px;text-align:center;">
  <a href="${formUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:14px;font-weight:600;padding:16px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
    Start your landlord information form →
  </a>
  <p style="margin:10px 0 0;font-size:12px;color:#999;">You can save and return at any time — the link stays active.</p>
</div>

<p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6">
  If you have any questions at any point, simply reply to this email and I will come back to you directly.
</p>

<p style="margin:24px 0 4px;font-size:15px;color:#333">Kind regards,</p>`
}
