import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

async function sendEmail(to: string, subject: string, html: string) {
  const r = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: 'Capital Rooms <hello@capitalrooms.co.uk>', to, subject, html }),
  })
  if (!r.ok) throw new Error(await r.text())
}

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

  try {
    await sendEmail(email.trim(), 'Welcome to Capital Rooms — Getting Started', welcomePackHtml(full_name_or_name.trim(), formUrl))
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

// ── Welcome pack HTML ──────────────────────────────────────────────────────────

function welcomePackHtml(name: string, formUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to Capital Rooms</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">

  <!-- Header -->
  <tr>
    <td style="background:#1a1a1a;padding:32px 40px">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px">Capital Rooms</p>
      <p style="margin:6px 0 0;font-size:12px;color:#888;letter-spacing:0.2em;text-transform:uppercase">Specialist HMO Management · London</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 40px 32px">
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

      <!-- CTA -->
      <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
        <tr>
          <td style="background:#1a1a1a;border-radius:6px;padding:14px 28px">
            <a href="${formUrl}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px">
              Complete Your Landlord Information Form →
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6">
        If you have any questions at any stage, please do not hesitate to contact us directly at
        <a href="mailto:hello@capitalrooms.co.uk" style="color:#1a1a1a">hello@capitalrooms.co.uk</a>.
      </p>

      <p style="margin:24px 0 0;font-size:15px;color:#333">Kind regards,</p>
      <p style="margin:4px 0 0;font-size:15px;color:#333;font-weight:600">The Capital Rooms Team</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f8f8f8;border-top:1px solid #eee;padding:24px 40px">
      <p style="margin:0;font-size:11px;color:#999;line-height:1.6">
        Capital Rooms Ltd · Member of The Property Ombudsman · ClientMoney Protect · Deposit Protection Service<br>
        This email was sent because you have expressed interest in Capital Rooms management services.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
}
