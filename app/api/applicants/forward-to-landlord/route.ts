import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/portalAuth'
import { emailHtml, FROM, tableRow } from '@/lib/emailTemplate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  if (!(await requireStaff(request as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { applicantId, landlordEmail } = await request.json()

    if (!applicantId || !landlordEmail) {
      return Response.json({ error: 'Missing applicantId or landlordEmail' }, { status: 400 })
    }

    const { data: applicant, error: aErr } = await supabase
      .from('applicants')
      .select('*, rooms(name, current_asking_rent), properties(name, address)')
      .eq('id', applicantId)
      .single()

    if (aErr || !applicant) {
      return Response.json({ error: 'Applicant not found' }, { status: 404 })
    }

    const prop     = applicant.properties as any
    const room     = applicant.rooms as any
    const propAddress = prop?.address || prop?.name || 'the property'
    const roomName = room?.name || 'the room'
    const monthly  = room?.current_asking_rent
    const weekly   = monthly ? Math.round((monthly * 12) / 52) : null

    const rentLine = monthly
      ? `£${monthly.toLocaleString()} pcm${applicant.rent_offer_type === 'below_asking' && applicant.offered_rent ? ` · applicant offered £${applicant.offered_rent.toLocaleString()} pcm` : ' (asking price)'}`
      : null

    const body = `
      <p style="margin:0 0 6px;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">New Application</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.7;">
        <strong>${applicant.full_name}</strong> has submitted an application for
        <strong>${roomName}</strong> at <strong>${propAddress}</strong>.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:13px;">
        ${tableRow('Name',         applicant.full_name)}
        ${tableRow('Email',        applicant.email)}
        ${tableRow('Phone',        applicant.phone || '—')}
        ${rentLine ? tableRow('Rent',  rentLine) : ''}
        ${weekly   ? tableRow('Holding deposit', `£${weekly.toLocaleString()} (1 week)`) : ''}
        ${applicant.profession    ? tableRow('Profession',   applicant.profession)    : ''}
        ${applicant.salary        ? tableRow('Salary',       applicant.salary)        : ''}
        ${applicant.current_address ? tableRow('Current address', applicant.current_address) : ''}
        ${applicant.preferred_start_date ? tableRow('Move-in',  new Date(applicant.preferred_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })) : ''}
        ${applicant.preferred_term ? tableRow('Term',       applicant.preferred_term) : ''}
        ${applicant.sociability   ? tableRow('Personality', applicant.sociability.replace('-',' ')) : ''}
        ${applicant.linkedin_url  ? tableRow('LinkedIn',    applicant.linkedin_url)   : ''}
      </table>

      ${applicant.bio ? `
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">About them</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.75;">${applicant.bio}</p>
      ` : ''}

      ${applicant.profession_description ? `
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">Career</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.75;">${applicant.profession_description}</p>
      ` : ''}

      ${applicant.interests ? `
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">Interests</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.75;">${applicant.interests}</p>
      ` : ''}

      ${applicant.house_preferences ? `
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;">House preferences</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.75;">${applicant.house_preferences}</p>
      ` : ''}

      <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0 16px">
      <p style="font-size:12px;color:#777;margin:0;line-height:1.6;">
        Forwarded by Capital Rooms · management@capitalrooms.co.uk
      </p>
    `

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [landlordEmail],
        subject: `New application: ${applicant.full_name} — ${roomName}, ${propAddress}`,
        html:    await emailHtml(body, { req: request }),
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      console.error('Resend error:', err)
      return Response.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('forward-to-landlord error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
