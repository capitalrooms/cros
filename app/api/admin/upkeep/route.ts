// GET /api/admin/upkeep?propertyId= — what's been spent on each part of the house, and when it was last decorated
// (lib/property/upkeep). Office only.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { upkeepFor } from '@/lib/property/upkeep'
import { suggestSplit } from '@/lib/property/splitSuggest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('propertyId') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which house?' }, { status: 400 })
  const s = createServiceClient()
  // inventory items no one could date yet (migration 270) — the office is asked roughly when they were bought
  const { data: undated } = await s.from('room_inventory').select('id, item, description, area, room_id, added_by, created_at, rooms(name)').eq('property_id', id).eq('needs_date', true).is('removed_at', null).order('created_at')
  return NextResponse.json({ ...(await upkeepFor(s as any, id)), undated: undated ?? [] })
}

// POST { source, lineId, splits: [{ area, amount }] } — how a job naming several areas is divided (must add up to the
// line's amount); splits: [] puts it back to equal shares.
export async function POST(req: NextRequest) {
  const who = await requireStaff(req)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  // { action: 'date_item', id, year } — roughly when an inventory item was bought (or 'unknown' to stop asking)
  if (b.action === 'date_item') {
    const year = String(b.year ?? '')
    const upd = /^(19|20)\d{2}$/.test(year) ? { bought_on: `${year}-06-30`, bought_approx: true, bought_note: `About ${year} (confirmed by ${who.email})`, needs_date: false } : year === 'unknown' ? { needs_date: false, bought_note: 'Not known' } : null
    if (!upd) return NextResponse.json({ error: 'A year like 2022' }, { status: 400 })
    const { error } = await createServiceClient().from('room_inventory').update(upd).eq('id', String(b.id))
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  // { action: 'suggest', source, lineId, areas: [{key,label}] } → the AI's suggested split (nothing saved)
  if (b.action === 'suggest') {
    if (!['expense', 'statement'].includes(b.source) || !Array.isArray(b.areas) || !b.areas.length) return NextResponse.json({ error: 'Which line?' }, { status: 400 })
    try { return NextResponse.json(await suggestSplit(createServiceClient() as any, b.source, String(b.lineId), b.areas.slice(0, 12))) }
    catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Couldn’t suggest a split' }, { status: 502 }) }
  }
  if (!['expense', 'statement'].includes(b.source) || !/^[0-9a-f-]{36}$/i.test(String(b.lineId))) return NextResponse.json({ error: 'Which line?' }, { status: 400 })
  const s = createServiceClient()
  const splits = (Array.isArray(b.splits) ? b.splits : []).map((x: any) => ({ area: String(x.area).slice(0, 40), amount: Math.round(Number(x.amount) * 100) / 100 })).filter((x: any) => x.area && x.amount >= 0)
  if (!splits.length) { await s.from('upkeep_splits').delete().eq('source', b.source).eq('line_id', b.lineId); return NextResponse.json({ ok: true }) }
  const { data: line } = b.source === 'expense'
    ? await s.from('recharge_expenses').select('amount').eq('id', b.lineId).maybeSingle()
    : await s.from('statement_line_items').select('amount').eq('id', b.lineId).maybeSingle()
  const full = Math.abs(Number((line as any)?.amount ?? NaN))
  const sum = splits.reduce((n: number, x: any) => n + x.amount, 0)
  if (!isFinite(full) || Math.abs(sum - full) > 0.02) return NextResponse.json({ error: `The parts add up to £${sum.toFixed(2)} — they need to make £${isFinite(full) ? full.toFixed(2) : '?'}` }, { status: 400 })
  const { error } = await s.from('upkeep_splits').upsert({ source: b.source, line_id: b.lineId, splits, set_by: who.email, set_at: new Date().toISOString() })
  return error ? NextResponse.json({ error: /upkeep_splits/.test(error.message) ? 'Needs migration 270 running in Supabase first' : error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
