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

const RESEND = 'https://api.resend.com/emails'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

// POST /api/invite-tenant
// Body: { personId }
// Generates a Supabase magic link and sends a branded welcome email.

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser()
  if (!admin || !['administrator', 'admin', 'lettings'].includes(admin.assignment?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { personId } = await req.json()
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })

  const supabase = createServiceClient()

  // Get tenant details
  const { data: person, error: pErr } = await supabase
    .from('people')
    .select('id, name, email, phone')
    .eq('id', personId)
    .single()

  if (pErr || !person?.email) {
    return NextResponse.json({ error: 'Tenant not found or has no email' }, { status: 404 })
  }

  // Get their current tenancy for the welcome details
  const today = new Date().toISOString().split('T')[0]
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('start_date, rent_monthly, room:rooms(name), property:properties(address)')
    .eq('person_id', personId)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Generate Supabase admin link (password reset acts as invite for new users)
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: person.email,
    options: { redirectTo: `${APP_URL}/` },
  })

  const signInLink = linkData?.properties?.action_link
    ?? `${APP_URL}/login?email=${encodeURIComponent(person.email)}`

  const firstName = getFirstName(person)

  const tenancyBlock = tenancy ? `
    <table cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f4;border-left:3px solid #86284a;border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:20px;">
      <tbody>
        <tr><td style="padding:4px 0;color:#78716c;font-weight:600;font-size:13px;width:140px;">Property</td>
            <td style="padding:4px 0;font-weight:700;font-size:13px;color:#1c1917;">${(tenancy.property as any)?.address ?? '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;font-weight:600;font-size:13px;">Room</td>
            <td style="padding:4px 0;font-weight:700;font-size:13px;color:#1c1917;">${(tenancy.room as any)?.name ?? '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;font-weight:600;font-size:13px;">Start date</td>
            <td style="padding:4px 0;font-weight:700;font-size:13px;color:#1c1917;">${new Date(tenancy.start_date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;font-weight:600;font-size:13px;">Monthly rent</td>
            <td style="padding:4px 0;font-weight:700;font-size:13px;color:#1c1917;">£${Number(tenancy.rent_monthly ?? 0).toFixed(2)}</td></tr>
      </tbody>
    </table>` : ''

  const body = `
    <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#1c1917;">Dear ${firstName},</p>
    <p style="margin:0 0 18px;font-size:14px;color:#3f3f46;line-height:1.7;">
      We are delighted to welcome you to Capital Rooms. Your tenancy is now set up on our
      management platform — please use the button below to access your tenant portal.
    </p>

    ${tenancyBlock}

    <p style="margin:0 0 20px;font-size:14px;color:#3f3f46;line-height:1.7;">
      Through your tenant portal you can track repairs, view upcoming visits, read messages from
      your property manager, and check your tenancy documents — all in one place.
    </p>

    <div style="text-align:center;margin:24px 0;">
      <a href="${signInLink}"
         style="display:inline-block;background:#86284a;color:#ffffff;font-size:14px;font-weight:700;
                padding:14px 32px;border-radius:6px;text-decoration:none;">
        Sign in to Capital Rooms →
      </a>
    </div>
    <p style="text-align:center;font-size:12px;color:#a8a29e;margin-bottom:24px;">
      Your login: <strong style="color:#78716c;">${person.email}</strong>
    </p>

    <div style="background:#f5f5f4;border-radius:6px;padding:16px;border:1px solid #e7e5e4;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1c1917;">Add to your home screen</p>
      <p style="margin:0 0 10px;font-size:12px;color:#78716c;line-height:1.5;">
        Capital Rooms works as an app on your phone — no download required.
        Once signed in, tap Share → "Add to Home Screen" on iPhone, or use the
        Chrome menu on Android.
      </p>
      <p style="margin:0;font-size:11px;color:#a8a29e;">Your housemates are already using it. It takes 30 seconds to set up.</p>
    </div>

    <p style="margin:20px 0 0;font-size:13px;color:#78716c;">
      Kind regards,<br>
      <strong style="color:#1c1917;">Capital Rooms Management</strong>
    </p>
  `

  const html = await buildEmail(body)

  // Check for DB-editable subject
  const tpl = await getTemplate('tenant-portal-invite')
  const emailSubject = tpl?.subject_line
    ? render(tpl.subject_line, { first_name: firstName })
    : 'Welcome to Capital Rooms — your tenant portal is ready'

  const emailRes = await fetch(RESEND, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM,
      to:   [person.email],
      subject: emailSubject,
      html,
    }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    return NextResponse.json({ error: `Email send failed: ${err}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sentTo: person.email })
}
