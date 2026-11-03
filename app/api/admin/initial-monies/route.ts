/**
 * /api/admin/initial-monies — a let-only let's initial monies (lib/finance/initialMonies, migration 231).
 *   GET  ?tenancyId=           → { expected, record, bankMatches }
 *   POST { tenancyId, action: 'receive', balanceAmount, receivedOn, fee, bankTransactionId?, notes? }
 *   POST { tenancyId, action: 'pay', paidOn, reference? }              → the landlord payment (PAY…)
 *   POST { tenancyId, action: 'transfer_fee', transferredOn, reference? } → the fee to the operations account (TRF…)
 *   POST { tenancyId, action: 'void', reason }                         → kept on record, bank line and holding deposit freed
 * Office and lettings staff. Every step is numbered and logged on the letting file.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { expectedFor, bankMatches, current, receive, pay, transferFee, voidRecord, receiptFor } from '@/lib/finance/initialMonies'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { getElectedCommsLive } from '@/lib/comms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenancyId = req.nextUrl.searchParams.get('tenancyId') ?? ''
  const s = createServiceClient()
  const probe = await s.from('initial_monies').select('id').limit(1)
  if (probe.error) return NextResponse.json({ setupNeeded: true, error: 'Initial monies need migration 231 running in Supabase first.' }, { status: 503 })
  const expected = await expectedFor(s, tenancyId)
  if ('error' in expected) return NextResponse.json({ error: expected.error }, { status: 404 })
  const record = await current(s, tenancyId)
  return NextResponse.json({ expected, record, bankMatches: record ? [] : await bankMatches(s, expected) })
}

export async function POST(req: NextRequest) {
  const who = await requireStaff(req)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.tenancyId) return NextResponse.json({ error: 'Which tenancy?' }, { status: 400 })
  const s = createServiceClient()
  const by = { personId: who.personId, email: who.email }
  // the tenant's receipt (migration 260): { action: 'receipt', preview? } — previewed, then sent by the office
  if (b.action === 'receipt') {
    const rc = await receiptFor(s, b.tenancyId)
    if ('error' in rc) return NextResponse.json({ error: rc.error }, { status: 409 })
    if (b.preview) return NextResponse.json(rc)
    if (!rc.to) return NextResponse.json({ error: 'No email address for the tenant.' }, { status: 422 })
    if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages you send are switched off in Settings. Nothing was sent.' }, { status: 409 })
    const { ok, error } = await sendEmail(rc.to, rc.subject, messageHtml(rc.text), { req })
    if (!ok) return NextResponse.json({ error: error ?? 'The email didn’t send' }, { status: 502 })
    const rec = await current(s, b.tenancyId)
    await s.from('initial_monies').update({ receipt_sent_at: new Date().toISOString(), receipt_sent_to: rc.to }).eq('id', rec.id)
    return NextResponse.json({ ok: true, to: rc.to })
  }
  const r = b.action === 'receive' ? await receive(s, b.tenancyId, b, by)
    : b.action === 'pay' ? await pay(s, b.tenancyId, b, by)
    : b.action === 'transfer_fee' ? await transferFee(s, b.tenancyId, b, by)
    : b.action === 'void' ? await voidRecord(s, b.tenancyId, b, by)
    : { error: 'Unknown action', status: 400 }
  return 'error' in r && r.error ? NextResponse.json({ error: r.error }, { status: (r as any).status ?? 400 }) : NextResponse.json(r)
}
