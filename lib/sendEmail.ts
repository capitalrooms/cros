/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Capital Rooms — enforced email sender                                   ║
 * ║                                                                          ║
 * ║  sendEmail() is the ONLY way to send email from this codebase.           ║
 * ║  It always wraps content in the shared shell via buildEmail().            ║
 * ║                                                                          ║
 * ║  DO NOT call Resend directly from route files.                           ║
 * ║  DO NOT build your own <html> wrapper in a route file.                   ║
 * ║  ALWAYS use: sendEmail(to, subject, bodyHtml)                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { buildEmail } from '@/lib/emailWrapper'
import { senderFor, type EmailSender } from '@/lib/email/sender'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

interface SendOptions {
  /** The request that triggered this email — the signed-in staff member becomes the sender */
  req?: Request | null
  /** Explicit sender (overrides req); defaults to the main administrator */
  sender?: EmailSender
  /** Reply-to address, if different from the sender */
  replyTo?: string
  /** Carbon-copy recipients */
  cc?: string[]
  /** Raw From header override — normally leave unset so the sender's own address is used */
  from?: string
  /** false → company footer instead of the sender's signature (e.g. marketing mailers that sign themselves) */
  signature?: boolean
  /** ICS / PDF attachments: [{filename, content}] where content is base64 */
  attachments?: Array<{ filename: string; content: string }>
}

interface SendResult {
  ok: boolean
  error?: string
}

/**
 * Send a branded Capital Rooms email.
 *
 * bodyHtml is the INNER content only — no <html>, no header, no footer.
 * The shared wrapper (lib/emailWrapper.ts) is applied automatically.
 *
 * @param to         Recipient email address
 * @param subject    Email subject line
 * @param bodyHtml   Inner body HTML (headings, paragraphs, tables — no shell)
 * @param opts       Optional: from, replyTo, attachments
 *
 * @example
 *   const { ok } = await sendEmail(
 *     'tenant@example.com',
 *     'Your viewing is confirmed',
 *     `<h2>Confirmed</h2><p>See you ${when}.</p>`
 *   )
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  bodyHtml: string,
  opts: SendOptions = {}
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[sendEmail] RESEND_API_KEY not set')
    return { ok: false, error: 'Email service not configured' }
  }

  const sender = opts.sender ?? await senderFor(opts.req)
  let html: string
  try {
    html = await buildEmail(bodyHtml, { sender, signature: opts.signature })
  } catch (err: any) {
    console.error('[sendEmail] buildEmail failed:', err?.message)
    return { ok: false, error: 'Failed to build email HTML' }
  }

  const payload: Record<string, unknown> = {
    from: opts.from ?? sender.from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  }
  payload.reply_to = opts.replyTo ?? sender.replyTo
  if (opts.cc?.length) payload.cc = opts.cc
  if (opts.attachments?.length) payload.attachments = opts.attachments

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      const msg = (detail as any)?.message ?? res.statusText
      console.error('[sendEmail] Resend error:', msg)
      return { ok: false, error: msg }
    }

    return { ok: true }
  } catch (err: any) {
    console.error('[sendEmail] fetch failed:', err?.message)
    return { ok: false, error: err?.message ?? 'Unknown send error' }
  }
}
