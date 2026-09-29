// PATCH /api/admin/quotes/[id] — act on one quote
//   { action: 'enter', amount, notes?, site_visit?, visit_date? }  price given by phone/email, typed in by the office
//   { action: 'accept' }    assign the job to this contractor at this price; other open quotes are declined
//   { action: 'decline' } | { action: 'withdraw' } | { action: 'resend' }
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { senderFor } from '@/lib/email/sender'
import { loadQuoteJob } from '@/lib/quotes/quoteRequest'
import { svc, QUOTE_COLS, quotesError, sendQuoteRequest, acceptQuote, type QuoteRow } from '@/lib/quotes/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await paramsPromise
  const body = await req.json().catch(() => ({}))
  const s = svc()

  const { data: q, error } = await s.from('maintenance_quotes').select(QUOTE_COLS).eq('id', id).maybeSingle()
  const msg = quotesError(error)
  if (msg) return NextResponse.json({ error: msg }, { status: 500 })
  if (!q) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  const quote = q as QuoteRow
  const decided = quote.status === 'accepted' || quote.status === 'declined' || quote.status === 'withdrawn'
  const now = new Date().toISOString()

  switch (body.action) {
    case 'enter': {
      const amount = body.amount === '' || body.amount == null ? null : Number(body.amount)
      if (amount != null && (!isFinite(amount) || amount < 0)) return NextResponse.json({ error: 'Enter the price as a number.' }, { status: 400 })
      if (amount == null && !body.site_visit) return NextResponse.json({ error: 'Enter a price, or tick that they need to visit first.' }, { status: 400 })
      if (decided) return NextResponse.json({ error: `This quote is already ${quote.status}.` }, { status: 409 })
      const { error: e } = await s.from('maintenance_quotes').update({
        amount, notes: String(body.notes || '').trim() || null, site_visit: !!body.site_visit,
        visit_date: body.site_visit && body.visit_date ? body.visit_date : null,
        status: 'submitted', submitted_at: now, entered_by_staff: true,
      }).eq('id', id)
      if (e) return NextResponse.json({ error: e.message }, { status: 500 })
      break
    }
    case 'accept': {
      if (quote.status === 'accepted') return NextResponse.json({ error: 'Already accepted.' }, { status: 409 })
      if (quote.status === 'withdrawn') return NextResponse.json({ error: 'This request was withdrawn.' }, { status: 409 })
      try {
        const r = await acceptQuote(s, quote, admin.personId, await senderFor(req), { thankOthers: body.thank_others !== false })
        return NextResponse.json({ ok: true, ...r })
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not accept the quote' }, { status: 400 })
      }
    }
    case 'decline':
    case 'withdraw': {
      if (decided) return NextResponse.json({ error: `This quote is already ${quote.status}.` }, { status: 409 })
      const { error: e } = await s.from('maintenance_quotes').update({ status: body.action === 'decline' ? 'declined' : 'withdrawn', decided_at: now }).eq('id', id)
      if (e) return NextResponse.json({ error: e.message }, { status: 500 })
      break
    }
    case 'resend': {
      if (decided) return NextResponse.json({ error: `This quote is already ${quote.status}.` }, { status: 409 })
      const job = await loadQuoteJob(s, quote.ticket_id)
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      const r = await sendQuoteRequest(s, quote, job, await senderFor(req))
      if (!r.ok) return NextResponse.json({ error: r.error || 'Email failed' }, { status: 502 })
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  const { data: fresh } = await s.from('maintenance_quotes').select(QUOTE_COLS).eq('id', id).single()
  return NextResponse.json({ ok: true, quote: fresh })
}
