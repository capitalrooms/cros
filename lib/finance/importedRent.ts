// Rent shown on statements imported from the previous agent (statements@ / AutoLedger, 14 Oct 2026). Their statements
// run payout to payout ("30 Jun – 31 Aug"), not month by month, so each rent line is put in the month it is FOR:
//   1. the rent period on the line itself ("Rent 01/08/2026 - 31/08/2026 - Room 4 …") — most lines carry one
//   2. else the month most of that statement's other rent lines are for (when most of them say)
//   3. else the first month in the statement's dates that doesn't already hold most of that rent (payout-to-payout
//      statements: "1 Jun – 3 Jul" is July's rent when June's is already on file)
// Used by the rent roll / Finance home for months before CROS collects rent (lib/finance/rentRoll).
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ImportedRentLine { propertyId: string; statementId: string; room: string; tenant: string; amount: number; month: string }

const DMY = /(\d{1,2})\/(\d{1,2})\/(\d{4})/
const ym = (d: Date) => d.toISOString().slice(0, 7)
const addMonths = (m: string, n: number) => { const [y, mm] = m.split('-').map(Number); return ym(new Date(Date.UTC(y, mm - 1 + n, 1))) }

function lineMonth(desc: string): string | null {
  const m = desc.match(DMY)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}` : null
}
function periodMonth(start?: string | null, end?: string | null): string | null {
  if (!start) return null
  const s = new Date(`${start}T12:00:00Z`), e = end ? new Date(`${end}T12:00:00Z`) : s
  for (let d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1)); d <= e; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const iso = d.toISOString().slice(0, 10)
    if (iso >= start && (!end || iso < end || start === end)) return iso.slice(0, 7)
  }
  return start.slice(0, 7)
}
const roomOf = (desc: string) => desc.match(/\bRoom\s*(\d+[A-Za-z]?)/i)?.[1] ?? ''
const tenantOf = (desc: string) => (desc.match(/\b(Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+[^-()\d]+/)?.[0] ?? '').trim()

/** Rent lines for one month, from imported statements without a room table. Exact repeats (same property, room,
 *  tenant, amount and stated period, on two statements) are counted once. */
export async function importedRentFor(s: SupabaseClient, month: string): Promise<ImportedRentLine[]> {
  // read a wide window: where an undated statement belongs depends on its neighbours
  const from = `${addMonths(month, -5)}-01`, to = `${addMonths(month, 5)}-28`
  const { data } = await s.from('statement_line_items')
    .select('statement_id, property_id, description, amount, period_start, period_end, statement_date, landlord_statements!inner(id, rooms, period_start, period_end)')
    .eq('category', 'rent_income').gte('statement_date', from).lte('statement_date', to)
  const rows = ((data ?? []) as any[]).filter(r => !(Array.isArray(r.landlord_statements?.rooms) && r.landlord_statements.rooms.length))   // those use their room table
  const amt = (r: any) => Math.round(Number(r.amount || 0) * 100) / 100

  // 1. lines that say their month; 2. a statement where most lines say → the rest follow
  const byStmt = new Map<string, any[]>()
  for (const r of rows) byStmt.set(r.statement_id, [...(byStmt.get(r.statement_id) ?? []), r])
  const monthOf = new Map<any, string>()
  const undated: { id: string; property: string; start: string; end: string; total: number; lines: any[] }[] = []
  for (const [id, ls] of byStmt) {
    const tally = new Map<string, number>()
    for (const r of ls) { const m = lineMonth(String(r.description)); if (m) { monthOf.set(r, m); tally.set(m, (tally.get(m) ?? 0) + 1) } }
    const dated = [...tally.values()].reduce((a, b) => a + b, 0)
    const rest = ls.filter(r => !monthOf.has(r))
    if (!rest.length) continue
    if (dated * 2 >= ls.length) { const usual = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]; for (const r of rest) monthOf.set(r, usual); continue }
    const st = ls[0].landlord_statements ?? {}
    undated.push({ id, property: ls[0].property_id, start: st.period_start ?? ls[0].period_start ?? ls[0].statement_date, end: st.period_end ?? ls[0].period_end ?? ls[0].statement_date, total: rest.reduce((t, r) => t + amt(r), 0), lines: rest })
  }

  // 3. a statement whose lines don't say: the first month in its dates that doesn't already have most of this much
  //    rent (statements are payout to payout — "1 Jun – 3 Jul" is July's rent when June's is already on file)
  const held = new Map<string, number>()   // property|month → rent already placed
  const add = (p: string, m: string, n: number) => held.set(`${p}|${m}`, (held.get(`${p}|${m}`) ?? 0) + n)
  for (const [r, m] of monthOf) add(r.property_id, m, amt(r))
  for (const u of undated.sort((a, b) => String(a.start).localeCompare(String(b.start)))) {
    const first = String(u.start).slice(0, 7)
    let last = String(u.end || u.start).slice(0, 7)
    if (String(u.end).slice(8, 10) === '01' && last > first) last = addMonths(last, -1)   // "1 Jun – 1 Jul" is June
    const candidates: string[] = []
    for (let m = first; m <= last && candidates.length < 6; m = addMonths(m, 1)) candidates.push(m)
    const pick = candidates.find(m => (held.get(`${u.property}|${m}`) ?? 0) < u.total * 0.5) ?? periodMonth(u.start, u.end) ?? first
    for (const r of u.lines) monthOf.set(r, pick)
    add(u.property, pick, u.total)
  }

  const seen = new Set<string>()
  const out: ImportedRentLine[] = []
  for (const r of rows) {
    if (monthOf.get(r) !== month) continue
    const desc = String(r.description ?? '')
    const room = roomOf(desc), tenant = tenantOf(desc), amount = amt(r)
    const stated = desc.match(DMY)?.[0]
    if (stated) {
      const key = `${r.property_id}|${room}|${tenant.toLowerCase()}|${amount}|${stated}`
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push({ propertyId: r.property_id, statementId: r.statement_id, room, tenant, amount, month })
  }
  return out
}
