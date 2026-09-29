import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { emailHtml, tableRow, ctaButton } from '@/lib/emailTemplate'
import { senderFields } from '@/lib/email/sender'

export const runtime = 'nodejs'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function makeCounterOfferToken(applicantId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return crypto.createHmac('sha256', secret).update(applicantId).digest('hex')
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offer Updated — Capital Rooms</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; background: #f9f9f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #fff; border: 1px solid #e5e5e5; max-width: 480px; width: 100%; padding: 40px 36px; text-align: center; }
    .logo { font-weight: 900; font-size: 20px; letter-spacing: 0.08em; color: #111; background: #111; color: #FFE000; display: inline-block; padding: 6px 14px; margin-bottom: 32px; }
    h1 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 16px; }
    p { font-size: 14px; color: #555; line-height: 1.7; }
    .tick { font-size: 48px; margin-bottom: 20px; display: block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Capital Rooms</div>
    <span class="tick">✓</span>
    <h1>Offer updated</h1>
    <p>Thank you — we've updated your offer to the asking rent and notified the team. We'll be in touch with you very shortly.</p>
  </div>
</body>
</html>`

const ALREADY_DONE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Already Updated — Capital Rooms</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; background: #f9f9f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #fff; border: 1px solid #e5e5e5; max-width: 480px; width: 100%; padding: 40px 36px; text-align: center; }
    .logo { font-weight: 900; font-size: 20px; letter-spacing: 0.08em; background: #111; color: #FFE000; display: inline-block; padding: 6px 14px; margin-bottom: 32px; }
    h1 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 16px; }
    p { font-size: 14px; color: #555; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Capital Rooms</div>
    <h1>Already submitted</h1>
    <p>Your offer has already been updated. Our team will be in touch with you soon.</p>
  </div>
</body>
</html>`

/**
 * GET /api/applicants/counter-offer?id=xxx&token=xxx
 *
 * Called when a rejected applicant clicks "Yes — I'm happy to match the asking rent"
 * in their rejection email. Stateless HMAC token (no DB column needed).
 *
 * On success:
 *   - Sets offered_rent = rooms.current_asking_rent
 *   - Sets pipeline_stage = 'applied' (re-activates application)
 *   - Sends admin notification email
 *   - Returns HTML success page
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id    = url.searchParams.get('id')
  const token = url.searchParams.get('token')

  if (!id || !token) {
    return new NextResponse('Invalid link.', { status: 400, headers: { 'Content-Type': 'text/plain' } })
  }

  // Validate HMAC
  const expected = makeCounterOfferToken(id)
  const valid = crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
  if (!valid) {
    return new NextResponse('Invalid or expired link.', { status: 403, headers: { 'Content-Type': 'text/plain' } })
  }

  const sb = adminClient()

  const { data: applicant, error: fetchErr } = await sb
    .from('applicants')
    .select('id, full_name, email, pipeline_stage, offered_rent, rooms(name, current_asking_rent), properties(name, address)')
    .eq('id', id)
    .single()

  if (fetchErr || !applicant) {
    return new NextResponse('Application not found.', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }

  // If already re-activated (they clicked the link twice)
  if (applicant.pipeline_stage !== 'rejected') {
    return new NextResponse(ALREADY_DONE_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } })
  }

  const askingRent = (applicant.rooms as any)?.current_asking_rent ?? null
  const roomName   = (applicant.rooms as any)?.name || 'the room'
  const address    = (applicant.properties as any)?.address || ''

  // Re-activate application at asking rent
  const { error: updateErr } = await sb
    .from('applicants')
    .update({
      pipeline_stage: 'applied',
      offered_rent: askingRent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    return new NextResponse('Something went wrong — please contact us directly.', { status: 500, headers: { 'Content-Type': 'text/plain' } })
  }

  // Notify admin
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const firstName = (applicant.full_name || '').split(' ')[0] || applicant.full_name
    const rentStr   = askingRent ? `£${Number(askingRent).toLocaleString()}` : '(unknown)'
    const baseUrl   = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

    const notifyBody = `
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;">🎉 Counter-offer accepted</p>
      <p style="margin:0 0 18px;line-height:1.75;">
        <strong>${applicant.full_name}</strong> has agreed to match the asking rent for ${roomName}${address ? ` at ${address}` : ''}.
        Their application has been automatically re-activated.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
        ${tableRow('Applicant',    applicant.full_name)}
        ${tableRow('Room',         `${roomName}${address ? ', ' + address : ''}`)}
        ${tableRow('New offer',    rentStr + ' per month')}
        ${tableRow('Previous offer', applicant.offered_rent ? `£${Number(applicant.offered_rent).toLocaleString()}` : '(not set)')}
      </table>
      <div style="margin:0 0 16px;">
        ${ctaButton('View application in CROS →', `${baseUrl}/admin/applicants`)}
      </div>
    `

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(await senderFields(req)),
        to: ['harry@capitalrooms.co.uk'],
        subject: `🎉 Counter-offer: ${firstName} has matched the asking rent — ${roomName}`,
        html: await emailHtml(notifyBody, { req: req }),
      }),
    }).catch(e => console.error('Counter-offer notify failed:', e))
  }

  return new NextResponse(SUCCESS_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } })
}
