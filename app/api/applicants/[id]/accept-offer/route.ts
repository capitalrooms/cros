import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Capital Rooms <noreply@capitalrooms.co.uk>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
const SORT_CODE = '20-18-93'
const ACCOUNT_NUMBER = '40162574'
const ACCOUNT_NAME = 'Capital Rooms Ltd'

function weeklyRent(monthly: number) {
  return Math.round((monthly * 12) / 52)
}

function buildRef(propertyCode: string | null, roomName: string | null) {
  const propPart = (propertyCode || 'CAP').toUpperCase().replace(/\s/g, '')
  const roomPart = (roomName || '').replace(/[^0-9]/g, '').padStart(2, '0')
  return `${propPart}${roomPart} RESERVE`.trim()
}

function buildEmail(body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
<div style="margin-bottom:24px"><img src="${APP_URL}/logo.png" alt="Capital Rooms" style="height:36px" onerror="this.style.display='none'"></div>
${body}
<hr style="border:none;border-top:1px solid #eee;margin:32px 0">
<p style="font-size:12px;color:#999;margin:0">Capital Rooms · management@capitalrooms.co.uk · 0207 112 9163</p>
</body></html>`
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  const role = (user?.assignment as any)?.role || ''
  if (!user || !['administrator', 'admin', 'lettings'].includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const applicantId = params.id

  // Load applicant + room + property
  const { data: applicant, error: aErr } = await supabase
    .from('applicants')
    .select('id, full_name, email, phone, room_id, property_id, pipeline_stage, rooms(id, name, current_asking_rent, properties(name, address, property_code))')
    .eq('id', applicantId)
    .single()

  if (aErr || !applicant) {
    return NextResponse.json({ error: 'Applicant not found' }, { status: 404 })
  }

  const room = (applicant.rooms as any)
  const property = room?.properties
  const monthly = room?.current_asking_rent || 0
  const weekly = weeklyRent(monthly)
  const payRef = buildRef(property?.property_code || null, room?.name || null)
  const firstName = applicant.full_name?.split(' ')[0] || 'there'
  const roomName = room?.name || 'the room'
  const propAddress = property?.address || property?.name || ''
  const reserveUrl = `${APP_URL}/applicant/reserve?roomId=${applicant.room_id}&propertyId=${applicant.property_id}`

  // Build email
  const tableRows = [
    ['Account name',      ACCOUNT_NAME],
    ['Sort code',         SORT_CODE],
    ['Account number',    ACCOUNT_NUMBER],
    ['Payment reference', payRef],
    ['Amount',            `£${weekly.toLocaleString()}`],
  ].map(([k, v]) => `<tr>
    <td style="padding:8px 12px;background:#f9f9f9;font-weight:600;border-bottom:1px solid #eee;width:40%">${k}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">${v}</td>
  </tr>`).join('')

  const html = buildEmail(`
<h1 style="font-size:22px;font-weight:700;margin:0 0 4px">The search is over! 🎉</h1>
<p style="font-size:16px;margin:0 0 24px">Hi ${firstName},</p>

<p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#444">
  Great news — we'd like to offer you <strong>${roomName}</strong>${propAddress ? ` at ${propAddress}` : ''}.
  ${monthly ? `The rent is <strong>£${monthly.toLocaleString()} per month</strong> (all bills included).` : ''}
</p>

<p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">
  To secure the room, we need a holding deposit of one week's rent — <strong>£${weekly.toLocaleString()}</strong>.
  This is deducted from your final balance, not an extra fee.
</p>

<h2 style="font-size:15px;font-weight:700;margin:0 0 12px">Pay by bank transfer</h2>
<table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">${tableRows}</table>

<p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">
  Once you've sent it, let us know — a screenshot of the confirmation is helpful. We'll take the room off the market as soon as payment is confirmed and get referencing started straight away.
</p>

<div style="text-align:center;margin:28px 0">
  <a href="${reserveUrl}" style="background:#86284a;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
    View full payment details →
  </a>
</div>

<p style="font-size:13px;color:#888;margin:0 0 4px">Or copy this link:</p>
<p style="font-size:13px;color:#555;word-break:break-all;background:#f5f5f5;padding:10px 12px;border-radius:6px;margin:0">${reserveUrl}</p>
`)

  const subject = `Your offer has been accepted — secure ${roomName} now`

  // Send email
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const emailRes = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [applicant.email], subject, html }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    console.error('Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  // Advance pipeline stage to offer_sent
  await supabase
    .from('applicants')
    .update({ pipeline_stage: 'offer_sent', updated_at: new Date().toISOString() })
    .eq('id', applicantId)

  return NextResponse.json({ success: true, emailSent: applicant.email, reserveUrl })
}
