import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { firstName as getFirstName } from '@/lib/people'
import { buildEmail, FROM } from '@/lib/emailWrapper'
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
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#78716c;font-weight:600;">${p.name ?? '—'}</td>
      <td style="padding:6px 0;font-size:13px;color:#1c1917;">${p.address ?? '—'}</td>
    </tr>`).join('')

  const body = `
    <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1c1917;">Dear ${firstName},</p>
    <p style="margin:0 0 18px;font-size:14px;color:#3f3f46;line-height:1.7;">
      Welcome to Capital Rooms. Your landlord portal is now live — use the button below
      to access your account, view financial statements, and manage your properties.
    </p>

    ${propertyRows ? `
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1c1917;">Your properties</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f4;border-left:3px solid #86284a;border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:20px;">
      <tbody>${propertyRows}</tbody>
    </table>` : ''}

    <p style="margin:0 0 20px;font-size:14px;color:#3f3f46;line-height:1.7;">
      Through your portal you can view monthly statements, track maintenance jobs,
      review compliance certificates, and approve large works — all in one place.
    </p>

    <div style="text-align:center;margin:24px 0;">
      <a href="${signInLink}"
         style="display:inline-block;background:#86284a;color:#ffffff;font-size:14px;font-weight:700;
                padding:14px 32px;border-radius:6px;text-decoration:none;">
        Access My Landlord Portal →
      </a>
    </div>
    <p style="text-align:center;font-size:12px;color:#a8a29e;margin-bottom:24px;">
      Your login: <strong style="color:#78716c;">${person.email}</strong>
    </p>

    <div style="background:#f5f5f4;border-radius:6px;padding:16px;border:1px solid #e7e5e4;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1c1917;">Add to your home screen</p>
      <p style="margin:0;font-size:12px;color:#78716c;line-height:1.5;">
        Capital Rooms works as an app — no download required. Once signed in on iPhone,
        tap Share → "Add to Home Screen". On Android, use the Chrome menu → "Add to Home Screen".
      </p>
    </div>

    <p style="margin:20px 0 0;font-size:13px;color:#78716c;">
      Kind regards,<br>
      <strong style="color:#1c1917;">Capital Rooms Management</strong>
    </p>
  `

  const html = await buildEmail(body)

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
