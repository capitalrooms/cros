/**
 * VAT by quarter (13 Nov 2026). Directors only — it includes the company's own costs.
 *   GET                       → { settings, periods }
 *   GET ?from=&to=            → one VAT period: the return boxes, statements, every fee and cost line
 *   GET ?from=&to=&csv=1      → the same as a spreadsheet for the accountant
 *   POST { from, rate?, quarterEnds, vatNumber } → the registration details (administrators)
 * lib/finance/vatReturn.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireDirector, requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { vatSettings, vatPeriods, vatPeriod, vatCsv } from '@/lib/finance/vatReturn'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await requireDirector(req))) return NextResponse.json({ error: 'Directors only' }, { status: 403 })
  const s = createServiceClient()
  const st = await vatSettings(s)
  const from = req.nextUrl.searchParams.get('from'), to = req.nextUrl.searchParams.get('to')
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const p = await vatPeriod(s, from, to)
    if (req.nextUrl.searchParams.get('csv')) return new NextResponse(vatCsv(p, st), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="VAT ${from} to ${to}.csv"` } })
    return NextResponse.json(p)
  }
  return NextResponse.json({ settings: st, periods: vatPeriods(st) })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdministrator(req)
  if (!admin) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const rate = Number(b.rate ?? 20), q = Number(b.quarterEnds)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.from)) || !(rate > 0 && rate <= 30) || ![1, 2, 3].includes(q)) return NextResponse.json({ error: 'Give the date VAT started, the rate and when your quarters end.' }, { status: 400 })
  const s = createServiceClient()
  const e1 = (await s.from('system_settings').upsert({ key: 'vat_registration', value: JSON.stringify({ from: b.from, rate, quarterEnds: q }) }, { onConflict: 'key' })).error
  const vn = String(b.vatNumber ?? '').replace(/\s+/g, ' ').trim().slice(0, 20)
  const e2 = vn ? (await s.from('system_settings').upsert({ key: 'vat_number', value: vn }, { onConflict: 'key' })).error : null
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2)!.message }, { status: 500 })
  await s.from('audit_logs').insert({ user_id: admin.personId, action: 'vat_registration', details: `from ${b.from} at ${rate}%, quarters end month ${q}${vn ? `, number ${vn}` : ''}` })
  return NextResponse.json({ ok: true })
}
