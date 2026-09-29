// POST /api/admin/quotes/preview { ticketId, contractorName?, message?, offApp? } → the quote-request PDF,
// exactly as a contractor would receive it — for checking before sending.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { senderFor } from '@/lib/email/sender'
import { loadQuoteJob } from '@/lib/quotes/quoteRequest'
import { svc, quotePdf } from '@/lib/quotes/store'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const job = await loadQuoteJob(svc(), String(body.ticketId || ''))
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const pdf = await quotePdf(job, {
    contractor_name: String(body.contractorName || 'Contractor'),
    message: String(body.message || '').trim() || null,
    channel: body.offApp ? 'email' : 'app',
    token: body.offApp ? 'your-private-link' : null,
    requested_at: new Date().toISOString(),
  }, await senderFor(req))
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Quote request ${job.reference}.pdf`, 'inline') },
  })
}
