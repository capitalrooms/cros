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

/** Every email CROS sends is also blind-copied here (16 Oct 2026 — Harry: "I have no idea if things are sending").
 *  EMAIL_COPY_TO overrides it; set it to "off" to stop the copies. */
export const COPY_TO = (process.env.EMAIL_COPY_TO ?? 'harry@capitalrooms.co.uk').trim()
const copyOn = () => !!COPY_TO && COPY_TO.toLowerCase() !== 'off'

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
  /** internal: no office copy / no failure alert (the alerts themselves) */
  noCopy?: boolean
  replyTo?: string
}

/**
 * The one place an email leaves CROS (15 Oct 2026 — every route used to call the email service itself).
 * Takes finished HTML; sender = the signed-in staff member (req) or the main administrator. Never throws:
 * returns the email service's Response, or a stand-in error Response if the service can't be reached.
 */
export async function deliverEmail(msg: OutgoingEmail, opts: { req?: Request | null; sender?: EmailSender } = {}): Promise<Response> {
  // "no email" placeholders (…@no-email.invalid — a contractor known only by mobile) are never sent to (25 Oct 2026)
  const realTo = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter(a => !/\.invalid$/i.test(String(a ?? '').trim()))
  if (!realTo.length) return Response.json({ message: 'No email address on file' }, { status: 422 })
  msg = { ...msg, to: Array.isArray(msg.to) ? realTo : realTo[0] }
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
  // a blind copy of everything to the office, unless it's already going there
  const everyone = [...(payload.to as string[]), ...(msg.cc ?? []), ...(msg.bcc ?? [])].map(a => String(a).toLowerCase())
  const bcc = [...(msg.bcc ?? []), ...(copyOn() && !msg.noCopy && !everyone.some(a => a.includes(COPY_TO.toLowerCase())) ? [COPY_TO] : [])]
  if (bcc.length) payload.bcc = bcc
  if (msg.attachments?.length) payload.attachments = msg.attachments
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    // every email is logged against its recipients (migration 242) so a tenant's or room's page can show what went
    if (!msg.noCopy) {
      const providerId = res.ok ? await res.clone().json().then((j: any) => j?.id ?? null).catch(() => null) : null
      const why = res.ok ? null : await res.clone().json().then((j: any) => j?.message || j?.error || `refused (${res.status})`).catch(() => `refused (${res.status})`)
      const { logMessage } = await import('@/lib/messageLog')
      await logMessage({ channel: 'email', to: payload.to as string[], cc: msg.cc, subject: String(payload.subject), html: msg.html, text: msg.text, providerId, ok: res.ok, error: why, sentBy: String(payload.from ?? '') })
    }
    if (!res.ok) {
      console.error('[deliverEmail] email service refused:', res.status, String(msg.subject).slice(0, 80))
      // tell the office straight away — a refused email otherwise only shows up in the server logs
      if (!msg.noCopy) {
        const why = await res.clone().json().then((j: any) => j?.message || j?.error || '').catch(() => '')
        await tellOfficeNotSent(payload.to as string[], String(msg.subject), `The email service refused it${why ? `: ${why}` : ''} (${res.status}).`)
      }
    }
    return res
  } catch (err: any) {
    console.error('[deliverEmail] could not reach the email service:', err?.message)
    if (!msg.noCopy) await import('@/lib/messageLog').then(m => m.logMessage({ channel: 'email', to: payload.to as string[], cc: msg.cc, subject: String(payload.subject), html: msg.html, ok: false, error: err?.message ?? 'network error', sentBy: String(payload.from ?? '') })).catch(() => {})
    if (!msg.noCopy) await tellOfficeNotSent(payload.to as string[], String(msg.subject), `CROS couldn’t reach the email service (${err?.message ?? 'network error'}).`)
    return Response.json({ message: err?.message ?? 'Could not reach the email service' }, { status: 502 })
  }
}

/** "Not sent" alert to the office for an email the service refused outright (bounces and blocked addresses are
 *  found afterwards by lib/email/deliveryWatch). Never throws. */
async function tellOfficeNotSent(to: string[], subject: string, why: string) {
  try {
    if (!copyOn()) return
    const { isTestAddress } = await import('@/lib/people')
    if (to.length && to.every(a => isTestAddress(a))) return   // only test accounts — nothing for the office to do
    const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
    await deliverEmail({
      to: [COPY_TO], noCopy: true,
      subject: `Not sent: ${subject}`.slice(0, 180),
      html: `<p>An email from CROS did <b>not</b> go out.</p><p><b>To:</b> ${esc(to.join(', '))}<br><b>Subject:</b> ${esc(subject)}<br><b>Why:</b> ${esc(why)}</p><p>Please send it again from CROS once the problem is fixed, or contact them another way.</p>`,
    })
  } catch { /* never let an alert break the send it's reporting on */ }
}
