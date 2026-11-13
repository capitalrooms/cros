// VAT by quarter (13 Nov 2026, Harry: "ideally it would know what VAT we have charged for each quarter and then we
// could dump this out"). The VAT on our fees is what each statement actually shows (lib/finance/books — the old system
// lists it on its own lines); the VAT we paid on company costs is what was filed with the receipt (company documents,
// migration 263). Laid out as the VAT return boxes HMRC uses, so it can go straight to the accountant.
//   Box 1 VAT due on sales · Box 4 VAT reclaimed on purchases · Box 5 net VAT (1 − 4)
//   Box 6 sales excluding VAT · Box 7 purchases excluding VAT
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadBooks, vatSetting } from '@/lib/finance/books'
import { VAT_FROM } from '@/lib/finance/vat'

const r2 = (n: number) => Math.round(n * 100) / 100
const iso = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10)
const endOfMonth = (y: number, m0: number) => iso(y, m0 + 1, 0)

export interface VatSettings { from: string; rate: number; quarterEnds: 1 | 2 | 3; vatNumber: string | null; set: boolean }

/** quarterEnds: which months the VAT quarters end — 1 = Jan/Apr/Jul/Oct, 2 = Feb/May/Aug/Nov, 3 = Mar/Jun/Sep/Dec. */
export async function vatSettings(s: SupabaseClient): Promise<VatSettings> {
  const [reg, { data: raw }, { data: num }] = await Promise.all([
    vatSetting(s),
    s.from('system_settings').select('value').eq('key', 'vat_registration').maybeSingle(),
    s.from('system_settings').select('value').eq('key', 'vat_number').maybeSingle(),
  ])
  let q: any = 1
  try { const v = typeof (raw as any)?.value === 'string' ? JSON.parse((raw as any).value) : (raw as any)?.value; if ([1, 2, 3].includes(Number(v?.quarterEnds))) q = Number(v.quarterEnds) } catch { /* default */ }
  const vn = (num as any)?.value
  return { from: reg?.from ?? VAT_FROM, rate: reg?.rate ?? 20, quarterEnds: q, vatNumber: typeof vn === 'string' && vn.trim() ? vn.trim() : null, set: !!reg }
}

/** The VAT periods from registration to today: the first runs from the VAT date to the first quarter end after it. */
export function vatPeriods(st: VatSettings, today = new Date().toISOString().slice(0, 10)) {
  const out: { from: string; to: string; label: string }[] = []
  const [fy, fm] = st.from.split('-').map(Number)
  // the first quarter-end month on or after the registration month
  let y = fy, m = fm   // 1-based month
  while (((m - st.quarterEnds) % 3 + 3) % 3 !== 0) { m++; if (m > 12) { m = 1; y++ } }
  let start = st.from
  for (let i = 0; i < 40; i++) {
    const end = endOfMonth(y, m - 1)
    const lab = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    out.push({ from: start, to: end, label: `${lab(start)} – ${lab(end)}` })
    if (end >= today) break
    start = iso(y, m, 1)
    m += 3; if (m > 12) { m -= 12; y++ }
  }
  return out.reverse()   // newest first
}

export async function vatPeriod(s: SupabaseClient, from: string, to: string) {
  const books = await loadBooks(s, { from, to })
  const fees = books.rows.filter(r => r.kind === 'fee')
  const cols = 'id, expense_date, amount, vat_amount, supplier, title, expense_category, voided_at'
  let { data: docs, error } = await s.from('company_documents').select(cols).gte('expense_date', from).lte('expense_date', to) as { data: any[] | null; error: any }
  if (error) docs = []
  const costs = (docs ?? []).filter(d => !d.voided_at && Number(d.amount))
  const box1 = r2(fees.reduce((t, r) => t + (r.vat ?? 0), 0))
  const box6 = r2(fees.reduce((t, r) => t + (r.net ?? 0), 0))
  const box4 = r2(costs.reduce((t, d) => t + Number(d.vat_amount || 0), 0))
  const box7 = r2(costs.reduce((t, d) => t + Number(d.amount) - Number(d.vat_amount || 0), 0))
  // by statement: net fees and the VAT on them, so a statement with fees but no VAT stands out
  const byStatement = new Map<string, { reference: string; landlord: string; property: string; month: string | null; net: number; vat: number }>()
  for (const r of fees) {
    const k = `${r.reference ?? ''}|${r.propertyId ?? ''}`
    const x = byStatement.get(k) ?? { reference: r.reference ?? '—', landlord: r.landlord, property: r.property, month: r.month ?? null, net: 0, vat: 0 }
    x.net = r2(x.net + (r.net ?? 0)); x.vat = r2(x.vat + (r.vat ?? 0)); byStatement.set(k, x)
  }
  return {
    from, to,
    boxes: { box1, box4, box5: r2(box1 - box4), box6, box7 },
    statements: [...byStatement.values()].sort((a, b) => a.landlord.localeCompare(b.landlord) || a.property.localeCompare(b.property)),
    feeLines: fees.map(r => ({ date: r.date, landlord: r.landlord, property: r.property, reference: r.reference, description: r.description, net: r.net ?? 0, vat: r.vat ?? 0 })),
    costLines: costs.map(d => ({ date: d.expense_date, supplier: d.supplier ?? '', description: d.title ?? '', category: d.expense_category ?? '', gross: r2(Number(d.amount)), vat: r2(Number(d.vat_amount || 0)) })),
    checks: books.checks.filter(c => /VAT/.test(c)),
  }
}

const cell = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
export function vatCsv(p: Awaited<ReturnType<typeof vatPeriod>>, st: VatSettings) {
  const rows: (string | number)[][] = [
    ['Capital Rooms Ltd — VAT', `${p.from} to ${p.to}`], ['VAT registration number', st.vatNumber ?? 'to follow'], [],
    ['Box 1 VAT due on sales', p.boxes.box1.toFixed(2)], ['Box 4 VAT reclaimed on purchases', p.boxes.box4.toFixed(2)], ['Box 5 Net VAT to pay', p.boxes.box5.toFixed(2)],
    ['Box 6 Total sales excluding VAT', p.boxes.box6.toFixed(2)], ['Box 7 Total purchases excluding VAT', p.boxes.box7.toFixed(2)], [],
    ['FEES CHARGED (sales)'], ['Date', 'Landlord', 'Property', 'Statement', 'Description', 'Net', 'VAT'],
    ...p.feeLines.map(l => [l.date, l.landlord, l.property, l.reference ?? '', l.description, l.net.toFixed(2), l.vat.toFixed(2)]), [],
    ['COMPANY COSTS (purchases)'], ['Date', 'Supplier', 'Description', 'Category', 'Gross', 'VAT'],
    ...p.costLines.map(l => [l.date, l.supplier, l.description, l.category, l.gross.toFixed(2), l.vat.toFixed(2)]),
    ...(p.checks.length ? [[], ['TO CHECK'], ...p.checks.map(c => [c])] : []),
  ]
  return rows.map(r => r.map(cell).join(',')).join('\n')
}

/** Month by month since registration (13 Nov 2026, Harry: "a VAT summary of what we have charged each month") —
 *  as Xero / QuickBooks / FreeAgent show it: VAT on sales, VAT on purchases and the net, with a running total for the
 *  quarter each month sits in. */
export async function vatMonths(s: SupabaseClient, st: VatSettings, today = new Date().toISOString().slice(0, 10)) {
  const to = endOfMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1)
  const books = await loadBooks(s, { from: st.from, to })
  let { data: docs, error } = await s.from('company_documents').select('expense_date, amount, vat_amount, voided_at').gte('expense_date', st.from).lte('expense_date', to) as { data: any[] | null; error: any }
  if (error) docs = []
  const periods = vatPeriods(st, today)
  const months: { month: string; label: string; fees: number; vatOnFees: number; costs: number; vatOnCosts: number; net: number; quarter: string; quarterSoFar: number }[] = []
  for (let d = st.from.slice(0, 7); d <= to.slice(0, 7);) {
    const fees = books.rows.filter(r => r.kind === 'fee' && String(r.month ?? r.date).slice(0, 7) === d)
    const cs = (docs ?? []).filter(x => !x.voided_at && String(x.expense_date).slice(0, 7) === d)
    const vatOnFees = r2(fees.reduce((t, r) => t + (r.vat ?? 0), 0)), vatOnCosts = r2(cs.reduce((t, x) => t + Number(x.vat_amount || 0), 0))
    const q = periods.find(p => d >= p.from.slice(0, 7) && d <= p.to.slice(0, 7))
    months.push({ month: d, label: new Date(`${d}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      fees: r2(fees.reduce((t, r) => t + (r.net ?? 0), 0)), vatOnFees, costs: r2(cs.reduce((t, x) => t + Number(x.amount) - Number(x.vat_amount || 0), 0)), vatOnCosts, net: r2(vatOnFees - vatOnCosts), quarter: q?.label ?? '', quarterSoFar: 0 })
    const [y, m] = d.split('-').map(Number); d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  // running total within each quarter
  const run = new Map<string, number>()
  for (const m of months) { const t = r2((run.get(m.quarter) ?? 0) + m.net); run.set(m.quarter, t); m.quarterSoFar = t }
  return months.reverse()
}

/** HMRC's deadline for a return and payment: one calendar month and seven days after the period ends. */
export function vatDueDate(periodTo: string) {
  const [y, m] = periodTo.split('-').map(Number)
  const end = endOfMonth(y, m)   // the last day of the following month
  const d = new Date(`${end}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().slice(0, 10)
}

/** Returns filed (system_settings 'vat_returns'): { [periodFrom]: { filedOn, amount, by } } — the return history. */
export async function vatFiled(s: SupabaseClient): Promise<Record<string, { filedOn: string; amount: number; by: string }>> {
  const { data } = await s.from('system_settings').select('value').eq('key', 'vat_returns').maybeSingle()
  try { const v = typeof (data as any)?.value === 'string' ? JSON.parse((data as any).value) : (data as any)?.value; return v && typeof v === 'object' ? v : {} } catch { return {} }
}
