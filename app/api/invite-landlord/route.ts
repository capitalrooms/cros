import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { firstName as getFirstName } from '@/lib/people'
import { emailHtml, FROM, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'
import { getTemplate, render } from '@/lib/messageTemplate'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const RESEND  = 'https://api.resend.com/emails'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

// POST /api/invite-landlord
// Body: { personId }
// Generates a magic link and sends a branded landlord welcome email.

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser()
  if (!admin || !['administrator', 'admin', 'lettings'].includes(admin.assignment?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { personId } = await req.json()
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })

  const supabase = createServiceClient()

  // Get landlord details + their properties
  const { data: person, error: pErr } = await supabase
    .from('people')
    .select('id, full_name, first_name, last_name, email, phone, landlord_comms_enabled')
    .eq('id', personId)
    .single()

  if (pErr || !person?.email) {
    return NextResponse.json({ error: 'Landlord not found or has no email' }, { status: 404 })
  }

  const { data: props } = await supabase
    .from('properties')
    .select('name, address')
    .eq('landlord_id', personId)

  // Generate magic link — lands at / which routes to /landlord by role
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: person.email,
    options: { redirectTo: `${APP_URL}/` },
  })

  const signInLink = linkData?.properties?.action_link
    ?? `${APP_URL}/login?email=${encodeURIComponent(person.email)}`

  const firstName = getFirstName(person)

  const propertyRows = (props || []).map((p: any) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#5a6272;font-weight:600">${p.property?.name ?? '—'}</td>
      <td style="padding:6px 0;font-size:13px;color:#1a1a1a">${p.property?.address ?? '—'}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f6f4;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f4;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

  <!-- Header -->
  <tr><td style="background:#162032;border-radius:8px 8px 0 0;padding:20px 28px">
    <span style="font-size:14px;font-weight:800;color:#ffffff;letter-spacing:0.06em">
      CAPITAL <span style="color:#C4922A">ROOMS</span>
    </span>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:28px 28px 24px">
    <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1a1a1a">Dear ${firstName},</p>
    <p style="margin:0 0 18px;font-size:14px;color:#2d3240;line-height:1.6">
      Welcome to Capital Rooms. Your landlord portal is now live — use the button below
      to access your account, view financial statements, and manage your properties.
    </p>

    ${propertyRows ? `
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1a1a1a">Your properties</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6f9;border-left:3px solid #162032;border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:20px">
      <tbody>${propertyRows}</tbody>
    </table>` : ''}

    <p style="margin:0 0 20px;font-size:14px;color:#2d3240;line-height:1.6">
      Through your portal you can view monthly statements, track maintenance jobs,
      review compliance certificates, and approve large works — all in one place.
    </p>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td align="center" style="padding-bottom:12px">
        <a href="${signInLink}"
           style="display:inline-block;background:#162032;color:#ffffff;font-size:14px;font-weight:700;
                  padding:14px 32px;border-radius:999px;text-decoration:none;letter-spacing:0.02em">
          Access My Landlord Portal →
        </a>
      </td></tr>
      <tr><td align="center">
        <p style="margin:0;font-size:12px;color:#9aa0ac">
          Your login: <strong style="color:#5a6272">${person.email}</strong>
        </p>
      </td></tr>
    </table>

    <hr style="border:none;border-top:1px solid #e4e2de;margin:24px 0">

    <!-- Add to home screen -->
    <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9f7f4;border-radius:6px;padding:16px;border:1px solid #e4e2de">
      <tr><td>
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1a1a1a">Add to your home screen</p>
        <p style="margin:0;font-size:12px;color:#5a6272;line-height:1.5">
          Capital Rooms works as an app — no download required. Once signed in on iPhone,
          tap Share → "Add to Home Screen". On Android, use the Chrome menu → "Add to Home Screen".
        </p>
      </td></tr>
    </table>

    <p style="margin:20px 0 0;font-size:13px;color:#5a6272">
      Kind regards,<br>
      <strong style="color:#1a1a1a">Capital Rooms Management</strong><br>
      <a href="mailto:management@capitalrooms.co.uk" style="color:#5a6272">management@capitalrooms.co.uk</a>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#162032;border-radius:0 0 8px 8px;padding:12px 28px">
    <span style="font-size:11px;color:rgba(255,255,255,0.4)">Capital Rooms · London</span>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`

  const landlordTpl = await getTemplate('landlord-portal-invite')
  const landlordSubject = landlordTpl?.subject_line
    ? render(landlordTpl.subject_line, { first_name: firstName })
    : 'Welcome to Capital Rooms — your landlord portal is ready'

  const emailRes = await fetch(RESEND, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM,
      to:   [person.email],
      subject: landlordSubject,
      html,
    }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    return NextResponse.json({ error: `Email send failed: ${err}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sentTo: person.email })
}
