/**
 * POST /api/admin/property-tasks/cert-email-supplier
 *
 * Send a booking email to a supplier about a compliance cert renewal.
 * Unlike /[id]/email-supplier this route is not tied to a specific task —
 * it's called from the global deadlines view when clicking "Book" on a cert alert.
 *
 * Body: {
 *   supplier_email: string
 *   supplier_name:  string
 *   subject:        string
 *   body:           string
 *   cert_type?:     string  — for audit log
 *   property_name?: string  — for audit log
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = user.assignment?.role
  if (role !== 'administrator' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Email not configured' }, { status: 500 })

  const { supplier_email, supplier_name, subject, body: emailBody } = await req.json()

  if (!supplier_email || !subject || !emailBody) {
    return NextResponse.json({ error: 'supplier_email, subject and body are required' }, { status: 400 })
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Capital Rooms <harry@capitalrooms.co.uk>',
      to:      [supplier_email],
      subject,
      text:    emailBody,
      html:    `<p style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#111;">${emailBody.replace(/\n/g, '<br>')}</p>`,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[cert-email-supplier] Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, sent_to: supplier_email })
}
