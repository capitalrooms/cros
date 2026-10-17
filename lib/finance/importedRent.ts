// Rent shown on statements imported for the import period (statements@ / AutoLedger, 14 Oct 2026) — the months before
// CROS collects rent itself. Used by the rent roll / Finance home for those months (lib/finance/rentRoll).
import type { SupabaseClient } from '@supabase/supabase-js'
import { statementMonth } from '@/lib/finance/statementMonth'

export interface ImportedRentLine { propertyId: string; statementId: string; room: string; tenant: string; amount: number; month: string }

const DMY = /(\d{1,2})\/(\d{1,2})\/(\d{4})/
const ym = (d: Date) => d.toISOString().slice(0, 7)
const addMonths = (m: string, n: number) => { const [y, mm] = m.split('-').map(Number); return ym(new Date(Date.UTC(y, mm - 1 + n, 1))) }

const roomOf = (desc: string) => desc.match(/\bRoom\s*(\d+[A-Za-z]?)/i)?.[1] ?? ''
const tenantOf = (desc: string) => (desc.match(/\b(Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+[^-()\d]+/)?.[0] ?? '').trim()

/** Rent lines for one month, from imported statements without a room table: every line on a statement belongs to
 *  that statement's month (lib/finance/statementMonth — the month on its reference, else its date). In the import
 *  period the agency issued one statement per house per month, so this is what happened — and a gap in a month means
 *  exactly one thing: that statement hasn't been imported (17 Oct 2026, Harry). Per-line rent dates used to move lines
 *  between months: Bagshaw Building's 25th-to-24th rent left June empty and put two months in October. Exact repeats
 *  (same property, room, tenant, amount and stated period, on two statements) are counted once. */
export async function importedRentFor(s: SupabaseClient, month: string): Promise<ImportedRentLine[]> {
  // the month's statements first (by their own month), then all their rent lines — a line's own date can be blank or
  // differ from its statement's, so lines are never picked by date
  const from = `${addMonths(month, -2)}-01`, to = `${addMonths(month, 2)}-28`
  const { data: sts } = await s.from('landlord_statements').select('id, rooms, period_start, period_end, statement_date, statement_reference')
    .gte('statement_date', from).lte('statement_date', to)
  const ids = ((sts ?? []) as any[]).filter(st => !(Array.isArray(st.rooms) && st.rooms.length) && statementMonth(st) === month).map(st => st.id)   // room tables are read by the rent roll
  if (!ids.length) return []
  const { data } = await s.from('statement_line_items').select('statement_id, property_id, description, amount').eq('category', 'rent_income').in('statement_id', ids)
  const rows = (data ?? []) as any[]
  const amt = (r: any) => Math.round(Number(r.amount || 0) * 100) / 100
  const seen = new Set<string>()
  const out: ImportedRentLine[] = []
  for (const r of rows) {
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
