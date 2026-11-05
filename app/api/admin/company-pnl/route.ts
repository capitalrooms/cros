/**
 * /api/admin/company-pnl — Capital Rooms' own profit and loss (lib/finance/companyPnl). Directors only.
 *   GET ?year=2026 (tax year from 6 April) | ?from=&to= → Pnl
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireDirector } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { companyPnl } from '@/lib/finance/companyPnl'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function GET(req: NextRequest) {
  if (!(await requireDirector(req))) return NextResponse.json({ error: 'The profit and loss is for directors only' }, { status: 403 })
  const q = req.nextUrl.searchParams
  let from = q.get('from'), to = q.get('to')
  if (!isDate(from) || !isDate(to)) {
    const y = Number(q.get('year')) || (() => { const d = new Date(); return d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 6) ? d.getFullYear() : d.getFullYear() - 1 })()
    from = `${y}-04-06`; to = `${y + 1}-04-05`
  }
  try { return NextResponse.json(await companyPnl(createServiceClient(), { from: from!, to: to! })) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? 'The profit and loss couldn’t be worked out' }, { status: 500 }) }
}
