/**
 * POST /api/admin/property-tasks/[id]/email-supplier
 *
 * Feature 5: Send a pre-written booking email to a contractor/supplier
 * from the cert deadline or task action sheet.
 *
 * Body: {
 *   supplier_email: string      — recipient email
 *   supplier_name:  string      — recipient name (for salutation)
 *   subject:        string      — email subject (editable by admin before sending)
 *   body:           string      — email body (editable by admin before sending)
 *   cert_type?:     string      — e.g. "Gas safety cert" (for audit log)
 *   property_name?: string      — for audit log
 * }
 *
 * Sends from harry@capitalrooms.co.uk via Resend.
 * Logs to audit table so you can see it was sent.
 *
 * Built with Feature 6 (quoting) in mind: when quote requests are added,
 * this route will be extended to also create a quote_request record and
 * attach the supplier email as the first contact attempt.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = user.assignment?.role
  if (role !== 'administrator' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Email not configured' }, { status: 500 })

  const { id: taskId } = await params
  const body = await req.json()
  const { supplier_email, supplier_name, subject, body: emailBody, cert_type, property_name } = body

  if (!supplier_email || !subject || !emailBody) {
    return NextResponse.json({ error: 'supplier_email, subject and body are required' }, { status: 400 })
  }

  // Send via Resend
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
    console.error('[email-supplier] Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 502 })
  }

  // Log the send against the task (append to notes)
  const s = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const sentNote = `[${new Date().toLocaleDateString('en-GB')}] 📧 Booking email sent to ${supplier_name || supplier_email}`

  await s
    .from('property_tasks')
    .update({
      notes: s.rpc ? undefined : sentNote, // simple append via select+update below
    })
    .eq('id', taskId)
    .then(async () => {
      const { data: task } = await s
        .from('property_tasks')
        .select('notes')
        .eq('id', taskId)
        .single()
      if (task) {
        const updated = task.notes ? `${task.notes}\n${sentNote}` : sentNote
        await s.from('property_tasks').update({ notes: updated }).eq('id', taskId)
      }
    })

  return NextResponse.json({ ok: true, sent_to: supplier_email })
}
