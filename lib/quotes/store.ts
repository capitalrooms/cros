// Server-side quote workflow: send a request, record a price, accept one (declines the rest, assigns the job).
// All writes use the service client — callers check who is asking first.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { sendEmail } from '@/lib/sendEmail'
import { tableRow, ctaButton, PORTAL_URL } from '@/lib/emailWrapper'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { nameFields } from '@/lib/people'
import type { EmailSender } from '@/lib/email/sender'
import { loadQuoteJob, renderQuoteRequestPdf, replyByDate, ukDate, accessNote, type QuoteJob } from './quoteRequest'

export const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export interface QuoteRow {
  id: string; ticket_id: string; contractor_id: string | null; contractor_name: string; contractor_email: string | null
  contractor_phone: string | null; channel: 'app' | 'email'; status: 'requested' | 'submitted' | 'accepted' | 'declined' | 'withdrawn'
  message: string | null; amount: number | null; notes: string | null; site_visit: boolean; visit_date: string | null
  entered_by_staff: boolean; token: string | null; requested_at: string; sent_at: string | null; submitted_at: string | null; decided_at: string | null
}

export const QUOTE_COLS = 'id, ticket_id, contractor_id, contractor_name, contractor_email, contractor_phone, channel, status, message, amount, notes, site_visit, visit_date, entered_by_staff, token, requested_at, sent_at, submitted_at, decided_at'

/** A friendly error when migration 184 hasn't been run yet. */
export function quotesError(e: { code?: string; message: string } | null): string | null {
  if (!e) return null
  if (e.code === 'PGRST205' || e.code === '42P01') return 'The quotes table is not set up yet — run migration 184 in Supabase.'
  return e.message
}

export const newToken = () => randomBytes(18).toString('base64url')
export const quoteLink = (token: string) => `${PORTAL_URL}/quote/${token}`
const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there'
const pdfName = (job: QuoteJob) => `Quote request ${job.reference}.pdf`

export async function quotePdf(job: QuoteJob, q: Pick<QuoteRow, 'contractor_name' | 'message' | 'channel' | 'token' | 'requested_at'>, sender: EmailSender) {
  return renderQuoteRequestPdf({
    job, contractorName: q.contractor_name, message: q.message,
    reply: { link: q.channel === 'email' && q.token ? quoteLink(q.token) : null, email: sender.replyTo, phone: sender.phone, viaApp: q.channel === 'app' },
    requestedAt: new Date(q.requested_at), biz: await fetchPDFBizSettings(),
  })
}

/** Email one contractor their quote request (PDF attached). Marks sent_at on success. */
export async function sendQuoteRequest(s: SupabaseClient, q: QuoteRow, job: QuoteJob, sender: EmailSender): Promise<{ ok: boolean; error?: string }> {
  if (!q.contractor_email) return { ok: false, error: `No email address for ${q.contractor_name}` }
  const pdf = await quotePdf(job, q, sender)
  const by = ukDate(replyByDate(job.priority, new Date(q.requested_at)))
  const cta = q.channel === 'app'
    ? ctaButton('Price it in the app', `${PORTAL_URL}/contractor/job/${job.id}`)
    : q.token ? ctaButton('Send your price', quoteLink(q.token)) : ''
  const body = `
    <p>Hi ${esc(firstName(q.contractor_name))},</p>
    <p>Could you price the job below for us? Full details and photos are in the attached PDF.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${tableRow('Job', esc(job.title))}
      ${tableRow('Where', esc([job.roomName, job.propertyAddress].filter(Boolean).join(', ')))}
      ${tableRow('Priority', esc(job.priority.charAt(0).toUpperCase() + job.priority.slice(1)))}
      ${tableRow('Price by', by)}
      ${tableRow('Reference', esc(job.reference))}
    </table>
    ${q.message ? `<p style="background:#f5f5f4;border-radius:8px;padding:12px 14px;">${esc(q.message).replace(/\n/g, '<br>')}</p>` : ''}
    ${cta}
    <p>${q.channel === 'email' ? 'Or just reply to this email with your price.' : 'Or reply to this email with your price.'} If you need to see it first, tell us when you could visit.</p>`
  const res = await sendEmail(q.contractor_email, `Quote request: ${job.title} — ${job.propertyName || job.propertyAddress}`, body, {
    sender, attachments: [{ filename: pdfName(job), content: pdf.toString('base64') }],
  })
  if (res.ok) await s.from('maintenance_quotes').update({ sent_at: new Date().toISOString() }).eq('id', q.id)
  return res
}

/** The contractor's people row — existing (by id or email) or created, so the job can be assigned and tracked. */
async function contractorPerson(s: SupabaseClient, q: QuoteRow): Promise<string> {
  if (q.contractor_id) return q.contractor_id
  if (q.contractor_email) {
    const { data: found } = await s.from('people').select('id').ilike('email', q.contractor_email).limit(1).maybeSingle()
    if (found) return found.id
  }
  const [first, ...rest] = q.contractor_name.trim().split(/\s+/)
  const { data, error } = await s.from('people').insert({
    ...nameFields(first || q.contractor_name, rest.join(' ')),
    email: q.contractor_email, phone: q.contractor_phone, role: 'contractor',
  }).select('id').single()
  if (error || !data) throw new Error(`Could not add ${q.contractor_name} as a contractor: ${error?.message}`)
  return data.id
}

/** Accept one quote: it becomes the job's contractor + price; every other open quote on the job is declined. */
export async function acceptQuote(s: SupabaseClient, q: QuoteRow, staffPersonId: string | null, sender: EmailSender, opts: { thankOthers?: boolean } = {}) {
  if (q.amount == null) throw new Error('This quote has no price yet — enter the price before accepting it.')
  const contractorId = await contractorPerson(s, q)
  const now = new Date().toISOString()
  const { error: tErr } = await s.from('maintenance_tickets').update({
    contractor_id: contractorId, status: 'assigned', on_hold: false,
    approved_at: now, approved_by: staffPersonId,
    quote_requested: false, quote_amount: q.amount, quote_notes: q.notes, quote_submitted_at: q.submitted_at ?? now,
  }).eq('id', q.ticket_id)
  if (tErr) throw new Error(tErr.message)
  await s.from('maintenance_quotes').update({ status: 'accepted', decided_at: now, contractor_id: contractorId }).eq('id', q.id)
  // the other contractors who were asked — told politely it's not this time (never who won, or at what price)
  const { data: others } = await s.from('maintenance_quotes').select('contractor_name, contractor_email, status')
    .eq('ticket_id', q.ticket_id).neq('id', q.id).in('status', ['requested', 'submitted'])
  await s.from('maintenance_quotes').update({ status: 'declined', decided_at: now })
    .eq('ticket_id', q.ticket_id).neq('id', q.id).in('status', ['requested', 'submitted'])

  // Tell the winner. App contractors book in the app; everyone else replies with dates.
  const job = await loadQuoteJob(s, q.ticket_id)
  let emailed = false
  if (job && q.contractor_email) {
    const body = `
      <p>Hi ${esc(firstName(q.contractor_name))},</p>
      <p>Thanks — we'd like to go ahead with your quote.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${tableRow('Job', esc(job.title))}
        ${tableRow('Where', esc([job.roomName, job.propertyAddress].filter(Boolean).join(', ')))}
        ${tableRow('Agreed price', gbp(Number(q.amount)))}
        ${tableRow('Reference', esc(job.reference))}
      </table>
      <p>${esc(accessNote(job))}</p>
      ${q.channel === 'app'
        ? ctaButton('Book a date in the app', `${PORTAL_URL}/contractor/job/${job.id}`)
        : '<p><strong>Reply with the dates you can attend</strong> and we\'ll confirm one and arrange access.</p>'}`
    emailed = (await sendEmail(q.contractor_email, `Quote accepted: ${job.title} — ${job.propertyName || job.propertyAddress}`, body, { sender })).ok
  }
  let thanked = 0
  if (opts.thankOthers !== false && job) {
    const seen = new Set([String(q.contractor_email || '').toLowerCase()])
    for (const o of (others ?? []) as any[]) {
      const email = String(o.contractor_email || '').trim().toLowerCase()
      if (!email || seen.has(email)) continue
      seen.add(email)
      const where = String(job.propertyName || job.propertyAddress || '').split(/[,\n]/)[0]
      const body = `
        <p>Hi ${esc(firstName(o.contractor_name))},</p>
        <p>Thank you for ${o.status === 'submitted' ? 'pricing' : 'looking at'} <strong>${esc(job.title)}</strong>${where ? ` at ${esc(where)}` : ''}. On this occasion we’ve gone ahead with another quote.</p>
        <p>We appreciate your time and will be in touch about future work.</p>`
      if ((await sendEmail(o.contractor_email, `Quote: ${job.title} — thank you`, body, { sender })).ok) thanked++
    }
  }
  return { contractorId, emailed, thanked }
}
