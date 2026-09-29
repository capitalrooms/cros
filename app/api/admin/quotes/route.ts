// GET  /api/admin/quotes?ticketId=…   quotes for one job
// GET  /api/admin/quotes?review=1     every returned quote still waiting for a decision (across jobs)
// POST /api/admin/quotes              ask several contractors to price a job
//   { ticketId, contractorIds: string[], others: [{ name, email, phone? }], message? }
// App contractors see it in their Quotes tab and get an email; everyone else gets the PDF by email with a
// private link to send their price. Asking for quotes counts as approving the job.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { senderFor } from '@/lib/email/sender'
import { loadQuoteJob } from '@/lib/quotes/quoteRequest'
import { svc, QUOTE_COLS, quotesError, newToken, sendQuoteRequest, type QuoteRow } from '@/lib/quotes/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const ticketId = req.nextUrl.searchParams.get('ticketId')
  let q = s.from('maintenance_quotes').select(`${QUOTE_COLS}, maintenance_tickets(id, title, status, properties(name))`).order('requested_at', { ascending: true })
  if (ticketId) q = q.eq('ticket_id', ticketId)
  else if (req.nextUrl.searchParams.get('review')) q = q.eq('status', 'submitted')
  else return NextResponse.json({ error: 'ticketId or review=1 required' }, { status: 400 })
  const { data, error } = await q
  const msg = quotesError(error)
  if (msg) return NextResponse.json({ error: msg }, { status: 500 })
  return NextResponse.json({ quotes: data })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ticketId = String(body.ticketId || '')
  const contractorIds: string[] = Array.isArray(body.contractorIds) ? body.contractorIds.filter(Boolean) : []
  const others: { name: string; email: string; phone?: string }[] = (Array.isArray(body.others) ? body.others : [])
    .map((o: any) => ({ name: String(o?.name || '').trim(), email: String(o?.email || '').trim().toLowerCase(), phone: String(o?.phone || '').trim() }))
    .filter((o: any) => o.name || o.email)
  const message = String(body.message || '').trim() || null

  if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 })
  if (!contractorIds.length && !others.length) return NextResponse.json({ error: 'Pick at least one contractor.' }, { status: 400 })
  const bad = others.find(o => !o.name || !EMAIL.test(o.email))
  if (bad) return NextResponse.json({ error: `Each extra contractor needs a name and a valid email (check "${bad.name || bad.email}").` }, { status: 400 })

  const s = svc()
  const job = await loadQuoteJob(s, ticketId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Don't ask the same person twice while their request is still open
  const { data: open, error: openErr } = await s.from('maintenance_quotes').select('contractor_id, contractor_email')
    .eq('ticket_id', ticketId).in('status', ['requested', 'submitted'])
  const msg = quotesError(openErr)
  if (msg) return NextResponse.json({ error: msg }, { status: 500 })
  const openIds = new Set((open ?? []).map(o => o.contractor_id).filter(Boolean))
  const openEmails = new Set((open ?? []).map(o => (o.contractor_email || '').toLowerCase()).filter(Boolean))

  const { data: people } = contractorIds.length
    ? await s.from('people').select('id, first_name, last_name, full_name, company, email, phone').in('id', contractorIds)
    : { data: [] as any[] }
  const rows = [
    ...(people ?? []).filter((p: any) => !openIds.has(p.id)).map((p: any) => ({
      contractor_id: p.id,
      contractor_name: p.company || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email,
      contractor_email: p.email, contractor_phone: p.phone, channel: 'app' as const,
    })),
    ...others.filter(o => !openEmails.has(o.email)).map(o => ({
      contractor_id: null, contractor_name: o.name, contractor_email: o.email, contractor_phone: o.phone || null,
      channel: 'email' as const, token: newToken(),
    })),
  ].map(r => ({ ...r, ticket_id: ticketId, message, requested_by: admin.personId }))
  if (!rows.length) return NextResponse.json({ error: 'Everyone picked has already been asked for this job.' }, { status: 409 })

  const { data: created, error } = await s.from('maintenance_quotes').insert(rows).select(QUOTE_COLS)
  const insErr = quotesError(error)
  if (insErr) return NextResponse.json({ error: insErr }, { status: 500 })

  // Asking for quotes = the job is approved; it leaves "to approve" and waits on prices.
  await s.from('maintenance_tickets').update({
    quote_requested: true, on_hold: false, approved_at: new Date().toISOString(), approved_by: admin.personId,
  }).eq('id', ticketId).is('approved_at', null)
  await s.from('maintenance_tickets').update({ quote_requested: true }).eq('id', ticketId)

  const sender = await senderFor(req)
  const results = await Promise.all((created as QuoteRow[]).map(async q => ({ id: q.id, name: q.contractor_name, ...(await sendQuoteRequest(s, q, job, sender)) })))
  return NextResponse.json({ quotes: created, sent: results })
}
