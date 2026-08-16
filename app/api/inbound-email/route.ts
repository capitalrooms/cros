import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyDocument, aiConfigured } from '@/lib/ai-classify'
import { validateEmail } from '@/lib/validation'
import { logAudit, getClientIp } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

type Attachment = { name: string; mime: string; bytes: Buffer }

/**
 * Inbound email webhook. Point your email provider's inbound/parse route here
 * (with ?secret=<INBOUND_EMAIL_SECRET> if that env is set). Handles the two
 * common shapes: Postmark-style JSON (Attachments[] with base64 Content) and
 * SendGrid/Mailgun-style multipart/form-data. Each PDF/image attachment is
 * stored, logged to the inbox, and classified by the AI (best effort).
 */
export async function POST(request: NextRequest) {
  // Optional shared secret so only your provider can post here.
  const secret = process.env.INBOUND_EMAIL_SECRET
  if (secret) {
    const url = new URL(request.url)
    const supplied = url.searchParams.get('secret') || request.headers.get('x-inbound-secret')
    if (supplied !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const ctype = request.headers.get('content-type') || ''
  let fromEmail = ''
  let subject = ''
  const attachments: Attachment[] = []

  try {
    if (ctype.includes('application/json')) {
      const body = await request.json()
      fromEmail = body.From || body.from || body.sender || ''
      subject = body.Subject || body.subject || ''
      const list = body.Attachments || body.attachments || []
      for (const a of list) {
        const b64 = a.Content || a.content || a.data
        const name = a.Name || a.name || a.filename || 'attachment'
        const mime = a.ContentType || a.contentType || a.type || 'application/octet-stream'
        if (!b64) continue
        attachments.push({ name, mime, bytes: Buffer.from(b64, 'base64') })
      }
    } else {
      // multipart/form-data (SendGrid Inbound Parse, Mailgun, etc.)
      const form = await request.formData()
      fromEmail = String(form.get('from') || form.get('sender') || form.get('From') || '')
      subject = String(form.get('subject') || form.get('Subject') || '')
      for (const [, value] of form.entries()) {
        if (value instanceof Blob && (value as any).name) {
          const file = value as File
          attachments.push({
            name: file.name || 'attachment',
            mime: file.type || 'application/octet-stream',
            bytes: Buffer.from(await file.arrayBuffer()),
          })
        }
      }
    }
  } catch (err) {
    await logAudit({ userId: 'webhook_inbound_email', action: 'security_invalid_input', details: 'Could not parse email payload', ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Could not parse the email payload' }, { status: 400 })
  }

  // Validate email format
  if (!fromEmail || !validateEmail(fromEmail)) {
    await logAudit({ userId: 'webhook_inbound_email', action: 'security_invalid_input', details: `Invalid fromEmail: ${fromEmail}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const usable = attachments.filter((a) => ALLOWED_MIME.includes(a.mime))
  if (usable.length === 0) {
    return NextResponse.json({ ok: true, stored: 0, note: 'No PDF/image attachments found' })
  }

  const supabase = db()
  let stored = 0

  for (const att of usable) {
    const ext = (att.name.split('.').pop() || 'bin').toLowerCase()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('inbox-docs')
      .upload(path, att.bytes, { upsert: true, contentType: att.mime })
    if (upErr) continue

    // Classify (best effort — the doc still lands in the inbox even if AI is off/errors).
    let ai_result: any = null
    let ai_error: string | null = null
    if (aiConfigured()) {
      try {
        ai_result = await classifyDocument(att.bytes, att.mime)
      } catch (e: any) {
        ai_error = e?.message || 'AI could not read this document'
      }
    } else {
      ai_error = 'AI not configured'
    }

    await supabase.from('inbox_documents').insert({
      from_email: fromEmail || null,
      subject: subject || null,
      filename: att.name,
      storage_path: path,
      mime: att.mime,
      ai_result,
      ai_error,
      status: 'new',
    })
    stored++
  }

  return NextResponse.json({ ok: true, stored })
}

// Lets you (and the provider's "test" button) confirm the endpoint is live.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'inbound-email', ai: aiConfigured() })
}
