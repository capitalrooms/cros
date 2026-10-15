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
 * ║  Already-wrapped HTML (a route's own full design): deliverEmail(msg)     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Greetings: never type a name after "Dear"/"Hi" — use lib/people (dearName / hiName / dearFromText /
 * personFromText), and pass the recipient to render() for saved templates (lib/messageTemplate).
 */

import { buildEmail } from '@/lib/emailWrapper'
import { senderFor, type EmailSender } from '@/lib/email/sender'
import { oneLine } from '@/lib/lettings/letWording'

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

  const res = await deliverEmail({ to, subject, html, cc: opts.cc, attachments: opts.attachments, from: opts.from, replyTo: opts.replyTo }, { sender })
  if (res.ok) return { ok: true }
  const detail = await res.json().catch(() => ({}))
  return { ok: false, error: (detail as any)?.message ?? res.statusText }
}

export interface OutgoingEmail {
  to: string | string[]
  subject: string
  /** Complete HTML, already in the house shell (buildEmail / emailHtml / a designed email) */
  html: string
  text?: string
  cc?: string[]
  bcc?: string[]
  attachments?: Array<{ filename: string; content: string; content_type?: string }>
  /** Normally unset — the sender's own address is used (lib/email/sender) */
  from?: string
  replyTo?: string
}

/**
 * The one place an email leaves CROS (15 Oct 2026 — every route used to call the email service itself).
 * Takes finished HTML; sender = the signed-in staff member (req) or the main administrator. Never throws:
 * returns the email service's Response, or a stand-in error Response if the service can't be reached.
 */
export async function deliverEmail(msg: OutgoingEmail, opts: { req?: Request | null; sender?: EmailSender } = {}): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[deliverEmail] RESEND_API_KEY not set')
    return Response.json({ message: 'Email service not configured' }, { status: 500 })
  }
  const sender = opts.sender ?? await senderFor(opts.req)
  const payload: Record<string, unknown> = {
    from: msg.from ?? sender.from,
    reply_to: msg.replyTo ?? sender.replyTo,
    to: Array.isArray(msg.to) ? msg.to : [msg.to],
    subject: oneLine(msg.subject),   // a line break (e.g. from a multi-line address) makes the email service refuse it
    html: msg.html,
  }
  if (msg.text) payload.text = msg.text
  if (msg.cc?.length) payload.cc = msg.cc
  if (msg.bcc?.length) payload.bcc = msg.bcc
  if (msg.attachments?.length) payload.attachments = msg.attachments
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) console.error('[deliverEmail] email service refused:', res.status, String(msg.subject).slice(0, 80))
    return res
  } catch (err: any) {
    console.error('[deliverEmail] could not reach the email service:', err?.message)
    return Response.json({ message: err?.message ?? 'Could not reach the email service' }, { status: 502 })
  }
}
