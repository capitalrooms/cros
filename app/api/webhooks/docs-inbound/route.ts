// POST /api/webhooks/docs-inbound
// Resend inbound webhook for docs@inbound.capitalrooms.co.uk (and invoices@ → Capture, lib/capture/email)
// Normalises Resend's inbound payload, runs AI classification on each attachment,
// stores in inbox_documents, and sends a smart admin email showing what was found
// with a one-click link to review and file.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scanDocument, fileHash } from '@/lib/scan-engine'
import { Resend } from 'resend'
import crypto from 'crypto'
import { senderFieldsSdk } from '@/lib/email/sender'
import { buildEmail } from '@/lib/emailWrapper'
import { handleInvoiceEmail } from '@/lib/capture/email'

// Give Vercel up to 5 minutes — fetching attachments + AI classification of multiple PDFs needs it
export const maxDuration = 300

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
  let verified = false
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
        verified = true
      }
    }

    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Resend email.received event payload — data is nested under body.data
  const emailData = body.data ?? body
  const inboundEmailId: string = emailData.email_id || emailData.id || ''
  const recipient: string = (emailData.to?.[0] || '').toLowerCase()

  // Invoices forwarded from the office mailbox → Capture (lib/capture/email). Money, so the signature is required.
  if ((emailData.to ?? []).some((t: string) => String(t).toLowerCase().includes('invoices@'))) {
    if (process.env.DOCS_INBOUND_WEBHOOK_SIGNING_SECRET && !verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const r = await handleInvoiceEmail(serviceClient(), emailData)
    console.log('invoices-inbound: kept=%d skipped=%j', r.kept, r.skipped)
    return NextResponse.json({ ok: true, ...r })
  }

  // Only process emails addressed to docs@
  if (recipient && !recipient.includes('docs@')) {
    return NextResponse.json({ ok: true, skipped: 'not a docs email' })
  }

  const from: string = emailData.from || emailData.sender || ''
  const subject: string = emailData.subject || 'Document'
  const attachments: Array<Record<string, any>> = emailData.attachments || []

  const fromEmail = from.replace(/.*<(.+)>/, '$1').trim().toLowerCase()
  console.log('docs-inbound: from=%s subject=%s attachments=%d id=%s', fromEmail, subject, attachments.length, inboundEmailId)
  const supabase = serviceClient()

  // Fetch attachment content — Resend does not include base64 in the webhook payload.
  // Must fetch from the Resend inbound attachments API using the email id.
  if (inboundEmailId && attachments.length) {
    for (const att of attachments) {
      if (!att.content && att.id) {
        try {
          const attResp = await fetch(
            `https://api.resend.com/emails/inbound/${inboundEmailId}/attachments/${att.id}`,
            { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }
          )
          if (attResp.ok) {
            const attMeta = await attResp.json()
            if (attMeta.download_url) {
              const fileResp = await fetch(attMeta.download_url)
              if (fileResp.ok) {
                const buf = await fileResp.arrayBuffer()
                att.content = Buffer.from(buf).toString('base64')
                console.log('docs-inbound: fetched attachment', att.filename, `${(buf.byteLength / 1024).toFixed(0)}KB`)
              }
            }
          } else {
            console.warn('docs-inbound: attachment API failed', attResp.status)
          }
        } catch (e) {
          console.warn('docs-inbound: could not fetch attachment', att.id, e)
        }
      }
    }
  }

  let stored = 0
  const errors: string[] = []
  const storedResults: Array<{
    filename: string
    mime: string
    ai_result: any
    ai_error: string | null
  }> = []

  for (const att of attachments) {
    const mime = att.content_type || att.contentType || att.mime_type || 'application/octet-stream'
    const allowed = ALLOWED_MIME.some(m => mime.startsWith(m))
    if (!allowed) continue

    const bytes = Buffer.from(att.content, 'base64')
    const hash = fileHash(bytes)
    const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `inbound/${Date.now()}_${safeName}`

    // Dedup: if we already classified a file with this exact hash, reuse the result
    const { data: dupRow } = await supabase
      .from('inbox_documents')
      .select('ai_result')
      .eq('file_hash', hash)
      .not('ai_result', 'is', null)
      .limit(1)
      .maybeSingle()

    // Upload to storage
    const { error: upErr } = await supabase.storage
      .from('inbox-docs')
      .upload(path, bytes, { contentType: mime, upsert: false })

    if (upErr) {
      errors.push(`${att.filename}: ${upErr.message}`)
      continue
    }

    // AI classify (best effort) — skip entirely if we have a cached result for this hash
    let ai_result: any = dupRow?.ai_result || null
    let ai_error: string | null = null
    if (!ai_result) {
      try {
        ai_result = await scanDocument(bytes, mime)
      } catch (e: any) {
        ai_error = e?.message || 'AI classification failed'
      }
    } else {
      console.log('docs-inbound: reusing cached AI result for hash', hash.slice(0, 8))
    }

    // ── Tenancy agreement matching ───────────────────────────────────────────
    // For tenancy agreements, try to match the person named in the document to
    // an existing applicant (being onboarded) or an existing tenant (for whom
    // we just want to update rent_due_day). Matching runs best-effort; a failed
    // match still stores the document — admin reviews unmatched docs manually.
    let matched_applicant_id: string | null = null
    let matched_person_id: string | null = null
    let match_confidence: number | null = null
    let extracted_rent_due_day: number | null = null

    if (ai_result?.doc_type === 'tenancy_agreement') {
      const docEmail = (ai_result.person_email || '').trim().toLowerCase()
      const docName  = (ai_result.person_name  || '').trim().toLowerCase()
      const rawDay   = ai_result.rent_due_day
      if (rawDay && Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= 31) {
        extracted_rent_due_day = rawDay
      }

      if (docEmail) {
        // 1. Try applicants first (new tenant being onboarded)
        const { data: matchedApplicant } = await supabase
          .from('applicants')
          .select('id, full_name, pipeline_stage')
          .eq('email', docEmail)
          .neq('pipeline_stage', 'converted')
          .maybeSingle()

        if (matchedApplicant) {
          matched_applicant_id = matchedApplicant.id
          match_confidence = 0.95
        } else {
          // 2. Try existing tenant
          const { data: matchedPerson } = await supabase
            .from('people')
            .select('id')
            .eq('email', docEmail)
            .eq('role', 'tenant')
            .maybeSingle()

          if (matchedPerson) {
            matched_person_id = matchedPerson.id
            match_confidence = 0.95

            // Auto-apply rent_due_day correction — this overwrites the default
            // (or any previously imported value) with the real value from the doc.
            // No admin confirmation needed: the doc IS the source of truth.
            if (extracted_rent_due_day) {
              const today = new Date().toISOString().slice(0, 10)
              await supabase
                .from('tenancies')
                .update({ rent_due_day: extracted_rent_due_day })
                .eq('person_id', matchedPerson.id)
                .or(`end_date.is.null,end_date.gte.${today}`)
            }
          }
        }
      } else if (docName) {
        // 3. Fuzzy name fallback — applicants only (existing tenants need email to be safe)
        const { data: allApplicants } = await supabase
          .from('applicants')
          .select('id, full_name')
          .neq('pipeline_stage', 'converted')

        let bestId: string | null = null
        let bestScore = 0
        for (const a of allApplicants || []) {
          const candidate = a.full_name.trim().toLowerCase()
          // Simple overlap: count shared tokens
          const docTokens = new Set(docName.split(/\s+/))
          const candTokens = candidate.split(/\s+/)
          const shared = candTokens.filter((t: string) => docTokens.has(t)).length
          const score = shared / Math.max(docTokens.size, candTokens.length)
          if (score > bestScore) { bestScore = score; bestId = a.id }
        }
        if (bestScore >= 0.67 && bestId) {
          matched_applicant_id = bestId
          match_confidence = Math.round(bestScore * 0.75 * 100) / 100 // cap at 0.75 for name-only
        }
      }
    }

    // Insert into inbox_documents
    const { error: insErr } = await supabase.from('inbox_documents').insert({
      from_email: fromEmail || null,
      subject: subject || null,
      filename: att.filename,
      storage_path: path,
      mime,
      file_hash: hash,
      ai_result,
      ai_error,
      status: 'new',
      matched_applicant_id,
      matched_person_id,
      match_confidence,
      extracted_rent_due_day,
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
        ...(await senderFieldsSdk()),
        to: ['harry@capitalrooms.co.uk'],
        subject: `📄 ${storedResults.length} document${storedResults.length > 1 ? 's' : ''} received — ready to file`,
        html: await buildEmail(`
            <p><strong>New document${storedResults.length > 1 ? 's' : ''} received</strong></p>
            <p style="color:#78716c;font-size:13px;">From: <strong>${fromEmail}</strong><br>Subject: ${subject}</p>
            ${docCards}
            <p style="font-size:13px;"><a href="https://cros-sigma.vercel.app/admin/ai-upload" style="color:#1a1a1a;">View all pending documents</a></p>`),
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
