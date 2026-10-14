// /api/admin/finance-dates — the agency's two set-up dates (lib/finance/dates).
//   GET  → { recordsStart, ledgerStart }                         anyone with Finance
//   POST { recordsStart?, ledgerStart? } (YYYY-MM-01)            administrators only; the books can't start after
//        CROS starts collecting rent. Logged.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin, requireAdministrator } from '@/lib/adminAuth'
import { getClientIp } from '@/lib/auditLog'
import { financeDates, isMonthStart } from '@/lib/finance/dates'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  return NextResponse.json(await financeDates(createServiceClient()))
}

export async function POST(req: NextRequest) {
  const admin = await requireAdministrator(req)
  if (!admin) return NextResponse.json({ error: 'Only an administrator can change these dates.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const now = await financeDates(s)
  const next = { recordsStart: b.recordsStart ?? now.recordsStart, ledgerStart: b.ledgerStart ?? now.ledgerStart }
  if (!isMonthStart(next.recordsStart) || !isMonthStart(next.ledgerStart)) return NextResponse.json({ error: 'Choose a month (the 1st).' }, { status: 400 })
  if (next.recordsStart > next.ledgerStart) return NextResponse.json({ error: 'Your records can’t start after CROS starts collecting rent.' }, { status: 400 })
  const at = new Date().toISOString()
  const rows = [
    ...(next.recordsStart !== now.recordsStart ? [{ key: 'records_start', value: next.recordsStart }] : []),
    ...(next.ledgerStart !== now.ledgerStart ? [{ key: 'client_ledger_start', value: next.ledgerStart }] : []),
  ].map(r => ({ ...r, updated_by: admin.personId, updated_at: at }))
  if (rows.length) {
    const { error } = await s.from('system_settings').upsert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await s.from('audit_logs').insert({ user_id: admin.personId, action: 'finance_dates_changed', details: `records ${now.recordsStart}→${next.recordsStart}; collecting ${now.ledgerStart}→${next.ledgerStart}`, ip_address: getClientIp(req.headers) })
  }
  return NextResponse.json(next)
}
