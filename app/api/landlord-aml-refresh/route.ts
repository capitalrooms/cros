import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTemplate, render } from '@/lib/messageTemplate'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cros-sigma.vercel.app'

// POST /api/landlord-aml-refresh
// Body: { landlordId, reason? }
// Creates a new onboarding row (is_refresh=true) and emails the landlord
export async function POST(req: NextRequest) {
  const { landlordId, reason } = await req.json()

  if (!landlordId) {
    return NextResponse.json({ error: 'landlordId is required' }, { status: 400 })
  }

  // Fetch the landlord from people
  const { data: landlord, error: fetchErr } = await svc()
    .from('people')
    .select('id, name, email')
    .eq('id', landlordId)
    .eq('role', 'landlord')
    .single()

  if (fetchErr || !landlord) {
    return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
  }

  // Create a fresh onboarding row for this re-verification
  const { data: row, error: insertErr } = await svc()
    .from('landlord_onboarding')
    .insert({
      name: landlord.name ?? landlord.email,
      email: landlord.email,
      landlord_people_id: landlord.id,
      is_refresh: true,
      refresh_reason: reason ?? 'periodic_review',
      stage: 1,
    })
    .select()
    .single()

  if (insertErr || !row) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  const formUrl = `${BASE_URL}/landlord/onboard/${row.token}`

  const amlTpl = await getTemplate('landlord-aml-reverification')
  const firstName = (landlord.name ?? landlord.email.split('@')[0]).split(' ')[0]
  const amlSubject = amlTpl?.subject_line
    ? render(amlTpl.subject_line, { first_name: firstName })
    : 'Action Required: AML Re-verification — Capital Rooms'

  // Send re-verification email
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Capital Rooms Compliance <management@capitalrooms.co.uk>',
      reply_to: 'management@capitalrooms.co.uk',
      to: landlord.email,
      subject: amlSubject,
      html: amlRefreshHtml(landlord.name ?? landlord.email.split('@')[0], formUrl),
    }),
  })

  let emailSent = false
  let emailError: string | undefined

  if (emailRes.ok) {
    emailSent = true
    await svc()
      .from('landlord_onboarding')
      .update({ welcome_sent_at: new Date().toISOString(), stage: 2 })
      .eq('id', row.id)
  } else {
    emailError = await emailRes.text()
  }

  return NextResponse.json({ ok: true, row, emailSent, emailError })
}

// GET /api/landlord-aml-refresh?landlordId=xxx
// Returns AML history for a landlord
export async function GET(req: NextRequest) {
  const landlordId = req.nextUrl.searchParams.get('landlordId')
  if (!landlordId) return NextResponse.json({ error: 'landlordId required' }, { status: 400 })

  const { data, error } = await svc()
    .from('landlord_onboarding')
    .select('id, is_refresh, stage, created_at, docs_received_at, onboarded_at, welcome_sent_at')
    .eq('landlord_people_id', landlordId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data ?? [] })
}

// ── Email template ─────────────────────────────────────────────────────────────

function amlRefreshHtml(name: string, formUrl: string) {
  const firstName = name.split(' ')[0]
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AML Re-verification — Capital Rooms</title>
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

  <!-- Compliance badge -->
  <tr>
    <td style="background:#fafaf9;border-bottom:1px solid #e8e8e8;padding:12px 40px">
      <p style="margin:0;font-size:11px;color:#666;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">
        🔒 Anti-Money Laundering · Periodic Re-verification
      </p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:40px 40px 32px">
      <p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">Dear ${firstName},</p>

      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
        As part of our obligations under the <strong>Money Laundering, Terrorist Financing and Transfer of Funds
        (Information on the Payer) Regulations 2017</strong> ("the Regulations"), we are required to periodically
        refresh the Customer Due Diligence (CDD) records we hold for all landlord clients.
      </p>

      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
        This is a standard regulatory requirement applicable to all letting and property management agents supervised
        by HMRC under the Regulations. Periodic re-verification ensures that the information and documentation we hold
        on file remains accurate, complete, and in compliance with our AML policy.
      </p>

      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
        We would be grateful if you could complete our updated landlord information form at your earliest convenience.
        In most cases, where your circumstances have not changed since your last submission, the process takes only a
        few minutes — a re-declaration of your existing details is all that is required.
      </p>

      <p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.6">
        If your circumstances <em>have</em> changed (e.g. new address, change of ownership structure, additional
        properties), please update the relevant sections accordingly and email any new supporting documents to
        <a href="mailto:compliance@capitalrooms.co.uk" style="color:#1a1a1a">compliance@capitalrooms.co.uk</a>.
      </p>

      <!-- CTA -->
      <table cellpadding="0" cellspacing="0" style="margin:0 0 32px">
        <tr>
          <td style="background:#1a1a1a;border-radius:6px;padding:14px 28px">
            <a href="${formUrl}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px">
              Complete AML Re-verification →
            </a>
          </td>
        </tr>
      </table>

      <!-- Legal note -->
      <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%">
        <tr>
          <td style="background:#fef9ec;border:1px solid #f5e6b2;border-radius:6px;padding:16px 20px">
            <p style="margin:0;font-size:13px;color:#7a6020;line-height:1.6">
              <strong>Please note:</strong> Failure to complete re-verification may result in Capital Rooms being
              unable to continue processing rental income or acting on your behalf in accordance with our regulatory
              obligations. We appreciate your prompt cooperation.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6">
        If you have any questions regarding this requirement, please contact our compliance team at
        <a href="mailto:compliance@capitalrooms.co.uk" style="color:#1a1a1a">compliance@capitalrooms.co.uk</a>.
      </p>

      <p style="margin:24px 0 0;font-size:15px;color:#333">Kind regards,</p>
      <p style="margin:4px 0 0;font-size:15px;color:#333;font-weight:600">The Capital Rooms Compliance Team</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f8f8f8;border-top:1px solid #eee;padding:24px 40px">
      <p style="margin:0;font-size:11px;color:#999;line-height:1.6">
        Capital Rooms Ltd · Supervised by HMRC under the Money Laundering Regulations 2017 ·
        Member of The Property Ombudsman · ClientMoney Protect · Deposit Protection Service<br>
        This communication is sent in accordance with our regulatory obligations and is not marketing material.
        Your personal data is processed in accordance with our Privacy Policy.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
}
