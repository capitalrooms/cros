// POST /api/webhooks/docs-inbound
// Resend inbound webhook for docs@inbound.capitalrooms.co.uk
// Normalises Resend's inbound payload, runs AI classification on each attachment,
// stores in inbox_documents, and sends a smart admin email showing what was found
// with a one-click link to review and file.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyDocument } from '@/lib/ai-classify'
import { Resend } from 'resend'
import crypto from 'crypto'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]

export async function POST(req: NextRequest) {
  let body: any
  try {
    const rawBody = await req.text()

    // Verify Resend webhook signature (Svix-based signing)
    const signingSecret = process.env.DOCS_INBOUND_WEBHOOK_SIGNING_SECRET
    if (signingSecret) {
      const svixId = req.headers.get('svix-id') || ''
      const svixTs = req.headers.get('svix-timestamp') || ''
      const svixSig = req.headers.get('svix-signature') || ''
      if (svixId && svixTs && svixSig) {
        const toSign = `${svixId}.${svixTs}.${rawBody}`
        const keyBytes = Buffer.from(signingSecret.replace(/^whsec_/, ''), 'base64')
        const hmac = crypto.createHmac('sha256', keyBytes).update(toSign).digest('base64')
        const expected = `v1,${hmac}`
        const valid = svixSig.split(' ').some(s => crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)))
        if (!valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Resend email.received event payload — data is nested under body.data
  const emailData = body.data ?? body
  const recipient: string = (emailData.to?.[0] || '').toLowerCase()

  // Only process emails addressed to docs@
  if (recipient && !recipient.includes('docs@')) {
    return NextResponse.json({ ok: true, skipped: 'not a docs email' })
  }

  const from: string = emailData.from || emailData.sender || ''
  const subject: string = emailData.subject || 'Document'
  const attachments: Array<{
    filename: string
    content_type: string
    content: string // base64
  }> = emailData.attachments || []

  const fromEmail = from.replace(/.*<(.+)>/, '$1').trim().toLowerCase()
  const supabase = serviceClient()

  let stored = 0
  const errors: string[] = []
  const storedResults: Array<{
    filename: string
    mime: string
    ai_result: any
    ai_error: string | null
  }> = []

  for (const att of attachments) {
    const mime = att.content_type || 'application/octet-stream'
    const allowed = ALLOWED_MIME.some(m => mime.startsWith(m))
    if (!allowed) continue

    const bytes = Buffer.from(att.content, 'base64')
    const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `inbound/${Date.now()}_${safeName}`

    // Upload to storage
    const { error: upErr } = await supabase.storage
      .from('inbox-docs')
      .upload(path, bytes, { contentType: mime, upsert: false })

    if (upErr) {
      errors.push(`${att.filename}: ${upErr.message}`)
      continue
    }

    // AI classify (best effort)
    let ai_result: any = null
    let ai_error: string | null = null
    try {
      ai_result = await classifyDocument(bytes, mime, att.filename)
    } catch (e: any) {
      ai_error = e?.message || 'AI classification failed'
    }

    // Insert into inbox_documents
    const { error: insErr } = await supabase.from('inbox_documents').insert({
      from_email: fromEmail || null,
      subject: subject || null,
      filename: att.filename,
      storage_path: path,
      mime,
      ai_result,
      ai_error,
      status: 'new',
    })

    if (insErr) {
      errors.push(`DB insert ${att.filename}: ${insErr.message}`)
    } else {
      stored++
      storedResults.push({ filename: att.filename, mime, ai_result, ai_error })
    }
  }

  // Send smart admin notification
  if (storedResults.length > 0) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)

      const docCards = storedResults.map(r => {
        const ai = r.ai_result as any
        const docType: string = ai?.document_type || ai?.doc_type || 'Document'
        const property: string = ai?.property_address || ai?.property || ''
        const amount: string = ai?.amount || ai?.total_amount || ''
        const expiry: string = ai?.expiry_date || ''
        const certType: string = ai?.certificate_type || ai?.cert_type || ''
        const summary: string = ai?.summary || ''

        const label = docType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

        let rows = ''
        if (property) rows += `<tr><td style="padding:4px 8px;color:#666;font-size:13px">Property</td><td style="padding:4px 8px;font-size:13px">${property}</td></tr>`
        if (amount) rows += `<tr><td style="padding:4px 8px;color:#666;font-size:13px">Amount</td><td style="padding:4px 8px;font-weight:bold;font-size:13px">£${amount}</td></tr>`
        if (expiry) rows += `<tr><td style="padding:4px 8px;color:#666;font-size:13px">Expires</td><td style="padding:4px 8px;font-size:13px">${expiry}</td></tr>`
        if (certType) rows += `<tr><td style="padding:4px 8px;color:#666;font-size:13px">Type</td><td style="padding:4px 8px;font-size:13px">${certType}</td></tr>`
        if (summary && !property && !amount) rows += `<tr><td colspan="2" style="padding:4px 8px;color:#666;font-size:12px;font-style:italic">${summary}</td></tr>`

        return `
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;background:#fff">
            <p style="font-weight:bold;color:#111;margin:0 0 8px">📄 ${label} detected</p>
            <p style="color:#888;font-size:12px;margin:0 0 8px">File: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${r.filename}</code></p>
            ${rows ? `<table style="width:100%;border-collapse:collapse;margin-bottom:12px">${rows}</table>` : ''}
            <a href="https://cros-sigma.vercel.app/admin/ai-upload" style="display:inline-block;background:#111;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold">Review &amp; file in CROS →</a>
          </div>`
      }).join('')

      await resend.emails.send({
        from: 'Capital Rooms <noreply@capitalrooms.co.uk>',
        to: ['harry@capitalrooms.co.uk'],
        subject: `📄 ${storedResults.length} document${storedResults.length > 1 ? 's' : ''} received — ready to file`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb">
            <h2 style="color:#111;margin-bottom:4px">📄 New document${storedResults.length > 1 ? 's' : ''} received</h2>
            <p style="color:#666;font-size:14px;margin-bottom:24px">
              From: <strong>${fromEmail}</strong><br>
              Subject: ${subject}
            </p>
            ${docCards}
            <p style="color:#999;font-size:12px;margin-top:24px">Capital Rooms CROS · <a href="https://cros-sigma.vercel.app/admin/ai-upload" style="color:#666">View all pending documents</a></p>
          </div>
        `,
      })
    } catch (e) {
      console.warn('docs-inbound: notify failed', e)
    }
  }

  return NextResponse.json({ ok: true, stored, errors })
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'docs-inbound' })
}
