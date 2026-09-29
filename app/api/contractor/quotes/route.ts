// GET  /api/contractor/quotes — the signed-in contractor's quote requests, with the job for each.
// POST /api/contractor/quotes — { quoteId, amount?, notes?, site_visit?, visit_date? } send / update a price.
// Quote requests don't assign the job, so these jobs aren't in the contractor's normal job list.
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/serverAuth'
import { sendEmail } from '@/lib/sendEmail'
import { tableRow, ctaButton, PORTAL_URL } from '@/lib/emailWrapper'
import { defaultSender } from '@/lib/email/sender'
import { svc, QUOTE_COLS, quotesError } from '@/lib/quotes/store'

export const dynamic = 'force-dynamic'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function contractor() {
  const me = await getCurrentUser()
  return me?.id && me.role === 'contractor' ? me : null
}

export async function GET() {
  const me = await contractor()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await svc().from('maintenance_quotes')
    .select(`${QUOTE_COLS}, maintenance_tickets(id, title, description, category, location, priority, status, created_at, property_id, room_id, properties(name, address), rooms(name))`)
    .eq('contractor_id', me.id).in('status', ['requested', 'submitted', 'accepted'])
    .order('requested_at', { ascending: false })
  const msg = quotesError(error)
  if (msg) return NextResponse.json({ quotes: [], warning: msg })   // table not there yet — the app still works
  return NextResponse.json({ quotes: data })
}

export async function POST(req: NextRequest) {
  const me = await contractor()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const s = svc()
  const { data: q } = await s.from('maintenance_quotes').select(`${QUOTE_COLS}, requested_by`).eq('id', String(body.quoteId || '')).eq('contractor_id', me.id).maybeSingle()
  if (!q) return NextResponse.json({ error: 'Quote request not found' }, { status: 404 })
  if (!['requested', 'submitted'].includes(q.status)) return NextResponse.json({ error: 'This quote request is closed.' }, { status: 409 })

  const amount = body.amount === '' || body.amount == null ? null : Number(body.amount)
  const siteVisit = !!body.site_visit
  if (amount != null && (!isFinite(amount) || amount < 0)) return NextResponse.json({ error: 'Enter the price as a number.' }, { status: 400 })
  if (amount == null && !siteVisit) return NextResponse.json({ error: 'Enter a price, or tick "I need to visit first".' }, { status: 400 })
  if (siteVisit && !body.visit_date) return NextResponse.json({ error: 'Pick a date for your site visit.' }, { status: 400 })
  const notes = String(body.notes || '').trim() || null

  const { error } = await s.from('maintenance_quotes').update({
    amount, notes, site_visit: siteVisit, visit_date: siteVisit ? body.visit_date : null,
    status: 'submitted', submitted_at: new Date().toISOString(), entered_by_staff: false,
  }).eq('id', q.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [{ data: asker }, { data: t }] = await Promise.all([
    q.requested_by ? s.from('people').select('email').eq('id', q.requested_by).maybeSingle() : Promise.resolve({ data: null }),
    s.from('maintenance_tickets').select('id, title, properties(name)').eq('id', q.ticket_id).maybeSingle(),
  ])
  if (t) {
    const price = amount != null ? '£' + amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Needs to visit first'
    await sendEmail((asker as any)?.email || 'management@capitalrooms.co.uk', `Quote in: ${q.contractor_name} — ${t.title}`, `
      <p><strong>${esc(q.contractor_name)}</strong> has sent a price in the app.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${tableRow('Job', esc(t.title || 'Maintenance job'))}
        ${tableRow('Property', esc((t as any).properties?.name || ''))}
        ${tableRow('Price', price)}
        ${notes ? tableRow('Notes', esc(notes).replace(/\n/g, '<br>')) : ''}
      </table>
      ${ctaButton('Compare quotes', `${PORTAL_URL}/admin/maintenance?ticket=${t.id}`)}`,
      { sender: await defaultSender(), signature: false }).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
