// Public (token) endpoint for contractors who aren't on the app.
// GET  → the job they were asked to price (no tenant names or contact details; no key safe code)
// POST → { amount?, notes?, site_visit?, visit_date? } — their price, or a request to visit first.
// The token is a long random string sent only to that contractor; it stops working once the quote is decided.
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/sendEmail'
import { tableRow, ctaButton, PORTAL_URL } from '@/lib/emailWrapper'
import { defaultSender } from '@/lib/email/sender'
import { loadQuoteJob, replyByDate, ukDate, accessNote } from '@/lib/quotes/quoteRequest'
import { svc, QUOTE_COLS, quotesError, type QuoteRow } from '@/lib/quotes/store'

export const dynamic = 'force-dynamic'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return { quote: null, error: null }
  const { data, error } = await svc().from('maintenance_quotes').select(`${QUOTE_COLS}, requested_by`).eq('token', token).maybeSingle()
  return { quote: data as (QuoteRow & { requested_by: string | null }) | null, error: quotesError(error) }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { quote, error } = await byToken((await params).token)
  if (error) return NextResponse.json({ error: 'This link is not working right now. Please reply to the email instead.' }, { status: 500 })
  if (!quote) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  const s = svc()
  const job = await loadQuoteJob(s, quote.ticket_id)
  if (!job) return NextResponse.json({ error: 'This job is no longer available.' }, { status: 404 })
  const office = await defaultSender()
  return NextResponse.json({
    contractorName: quote.contractor_name,
    status: quote.status,
    amount: quote.amount, notes: quote.notes, siteVisit: quote.site_visit, visitDate: quote.visit_date,
    message: quote.message,
    job: {
      reference: job.reference, title: job.title, category: job.category, priority: job.priority,
      where: [job.roomName, job.propertyAddress].filter(Boolean).join(', '),
      description: job.description, notes: job.notes, access: accessNote(job), photos: job.photoUrls,
      priceBy: ukDate(replyByDate(job.priority, new Date(quote.requested_at))),
    },
    office: { email: office.replyTo, phone: office.phone },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { quote, error } = await byToken((await params).token)
  if (error) return NextResponse.json({ error: 'This link is not working right now. Please reply to the email instead.' }, { status: 500 })
  if (!quote) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (!['requested', 'submitted'].includes(quote.status)) {
    return NextResponse.json({ error: quote.status === 'accepted' ? 'This quote has already been accepted — thank you.' : 'This quote request is closed.' }, { status: 409 })
  }
  const body = await req.json().catch(() => ({}))
  const amount = body.amount === '' || body.amount == null ? null : Number(body.amount)
  const siteVisit = !!body.site_visit
  if (amount != null && (!isFinite(amount) || amount < 0 || amount > 1_000_000)) return NextResponse.json({ error: 'Enter your price as a number, e.g. 180.' }, { status: 400 })
  if (amount == null && !siteVisit) return NextResponse.json({ error: 'Enter a price, or tick that you need to see it first.' }, { status: 400 })
  if (siteVisit && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.visit_date || ''))) return NextResponse.json({ error: 'Pick a date you could visit.' }, { status: 400 })
  const notes = String(body.notes || '').trim().slice(0, 4000) || null

  const s = svc()
  const { error: upErr } = await s.from('maintenance_quotes').update({
    amount, notes, site_visit: siteVisit, visit_date: siteVisit ? body.visit_date : null,
    status: 'submitted', submitted_at: new Date().toISOString(), entered_by_staff: false,
  }).eq('id', quote.id)
  if (upErr) return NextResponse.json({ error: 'Could not save your price. Please reply to the email instead.' }, { status: 500 })

  // Let whoever asked know, in their inbox.
  const [{ data: asker }, job] = await Promise.all([
    quote.requested_by ? s.from('people').select('email').eq('id', quote.requested_by).maybeSingle() : Promise.resolve({ data: null }),
    loadQuoteJob(s, quote.ticket_id),
  ])
  const to = (asker as any)?.email || 'management@capitalrooms.co.uk'
  if (job) {
    const price = amount != null ? '£' + amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Needs to visit first'
    await sendEmail(to, `Quote in: ${quote.contractor_name} — ${job.title}`, `
      <p><strong>${esc(quote.contractor_name)}</strong> has sent a price.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${tableRow('Job', esc(job.title))}
        ${tableRow('Where', esc([job.roomName, job.propertyAddress].filter(Boolean).join(', ')))}
        ${tableRow('Price', price)}
        ${siteVisit ? tableRow('Could visit', ukDate(body.visit_date)) : ''}
        ${notes ? tableRow('Notes', esc(notes).replace(/\n/g, '<br>')) : ''}
      </table>
      ${ctaButton('Compare quotes', `${PORTAL_URL}/admin/maintenance?ticket=${job.id}`)}`,
      { sender: await defaultSender(), signature: false }).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
