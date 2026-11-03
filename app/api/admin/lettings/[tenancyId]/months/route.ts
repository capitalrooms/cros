// GET /api/admin/lettings/<tenancy>/months — this tenancy's rent month by month, for its letting file's Money tab
// (rebuild, 3 Nov 2026: "old tenant payment records" — Harry wanted to follow a room to an old tenancy and see each
// month). Each month is the Rent Roll's own row for this tenancy (lib/finance/rentRoll), so the figures always agree
// with the Rent Roll: due pro rata at start and end; while CROS mirrors the old system, received is what that month's
// imported statement shows and nothing else. Months before the records start are listed as "before CROS records".
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { buildRentRoll } from '@/lib/finance/rentRoll'
import { recordsStart } from '@/lib/finance/dates'

const monthOf = (iso: string) => iso.slice(0, 7)
const nextMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}` }

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const s = createServiceClient()
  const { data: t } = await s.from('tenancies').select('id, start_date, end_date, let_cancelled_at').eq('id', tenancyId).maybeSingle()
  if (!t) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  if (!t.start_date || t.let_cancelled_at) return NextResponse.json({ months: [], before: null })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const records = monthOf(await recordsStart(s))
  const first = monthOf(t.start_date), last = monthOf(t.end_date && t.end_date < today ? t.end_date : today)
  const from = first < records ? records : first
  const list: string[] = []
  for (let m = from; m <= last && list.length < 36; m = nextMonth(m)) list.push(m)

  const rolls = await Promise.all(list.map(m => buildRentRoll(s, m).catch(() => null)))
  const months = list.map((m, i) => {
    const row = rolls[i]?.properties.flatMap(p => p.rooms).find(r => r.tenancyId === tenancyId) ?? null
    return {
      month: m,
      due: row?.due ?? null,
      received: row?.received ?? 0,
      difference: row?.difference ?? null,
      status: row?.status ?? 'no_charge',
      statement: row?.statement ?? null,
      receipts: row?.receipts ?? [],
      source: rolls[i]?.source ?? null,
    }
  }).reverse()   // newest first
  return NextResponse.json({ months, before: first < records ? { from: first, to: records } : null })
}
