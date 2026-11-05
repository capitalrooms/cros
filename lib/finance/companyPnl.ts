// Capital Rooms' own profit and loss (5 Nov 2026, Harry: "what our net profit is after all expenses, as well as
// turnover, costs by category so we can see what direct company operating expenses cost us the most"). Directors only.
//   turnover — management and letting fees, from the books (lib/finance/books: the statements), by the month the rent
//              is for; net of VAT once Capital Rooms is VAT registered
//   costs    — company expenses (CEX…: the office account, Capture), by month and category; their VAT is taken off
//              once registered, because it's reclaimed
//   net profit = turnover − costs (before corporation tax; wages count only when filed as a company cost)
//   expected turnover — every current managed tenancy's rent × its management fee, for the next 12 months
// Read-only. A picture for directors, not the statutory accounts (those stay with the accountant in Xero).
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadBooks, vatSetting } from '@/lib/finance/books'
import { resolveFee, feeAmount } from '@/lib/fees/managementFee'
import { demoPropertyIds } from '@/lib/demoProperties'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const VAT_THRESHOLD = 90_000   // UK VAT registration threshold from 1 April 2024

export interface Pnl {
  from: string; to: string
  months: { month: string; management: number; letting: number; turnover: number; costs: number; profit: number }[]
  totals: { management: number; letting: number; turnover: number; costs: number; profit: number; margin: number | null }
  costsByCategory: { category: string; amount: number; share: number; count: number }[]
  biggestCosts: { date: string; supplier: string | null; what: string; category: string; amount: number }[]
  expected: { perMonth: number; perYear: number; tenancies: number; noFee: number }
  vat: { registeredFrom: string | null; rate: number | null; onFees: number; onCosts: number; due: number } | null
  threshold: { last12: number; limit: number }
}

export async function companyPnl(s: SupabaseClient, o: { from: string; to: string }): Promise<Pnl> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const yearAgo = new Date(Date.parse(today) - 365 * 86_400_000).toISOString().slice(0, 10)
  const [books, last12, reg, demo] = await Promise.all([
    loadBooks(s, { from: o.from, to: o.to }),
    loadBooks(s, { from: yearAgo, to: today }),
    vatSetting(s),
    demoPropertyIds(s),
  ])
  // company costs: with their VAT when migration 263 has run
  let docs: any[] = []
  {
    const cols = 'expense_date, amount, expense_category, supplier, title, voided_at, vat_amount'
    const q = (c: string) => s.from('company_documents').select(c).gte('expense_date', o.from).lte('expense_date', o.to).not('amount', 'is', null)
    let { data, error } = await q(cols)
    if (error && /vat_amount/.test(error.message)) ({ data, error } = await q(cols.replace(', vat_amount', '')))
    docs = ((data ?? []) as any[]).filter(d => !d.voided_at && Number(d.amount) > 0)
  }
  const regFrom = reg?.from ?? null
  const costNet = (d: any) => r2(Number(d.amount) - (regFrom && d.expense_date >= regFrom ? Number(d.vat_amount || 0) : 0))

  // months from → to
  const months: Pnl['months'] = []
  for (let m = new Date(`${o.from.slice(0, 7)}-01T12:00:00Z`); m.toISOString().slice(0, 7) <= o.to.slice(0, 7); m.setUTCMonth(m.getUTCMonth() + 1)) {
    months.push({ month: m.toISOString().slice(0, 7), management: 0, letting: 0, turnover: 0, costs: 0, profit: 0 })
  }
  const at = (ym: string) => months.find(x => x.month === ym)
  for (const r of books.rows) if (r.kind === 'fee') {
    const x = at(String(r.month ?? r.date).slice(0, 7)); if (!x) continue
    const v = r.net ?? r.amount
    if (r.category === 'letting fee') x.letting = r2(x.letting + v); else x.management = r2(x.management + v)
  }
  for (const d of docs) { const x = at(String(d.expense_date).slice(0, 7)); if (x) x.costs = r2(x.costs + costNet(d)) }
  for (const x of months) { x.turnover = r2(x.management + x.letting); x.profit = r2(x.turnover - x.costs) }
  const sum = (k: 'management' | 'letting' | 'turnover' | 'costs' | 'profit') => r2(months.reduce((t, x) => t + x[k], 0))
  const totals = { management: sum('management'), letting: sum('letting'), turnover: sum('turnover'), costs: sum('costs'), profit: sum('profit'), margin: null as number | null }
  totals.margin = totals.turnover > 0 ? Math.round(totals.profit / totals.turnover * 1000) / 10 : null

  // costs by category, biggest first
  const cat = new Map<string, { amount: number; count: number }>()
  for (const d of docs) { const k = d.expense_category || 'Other'; const c = cat.get(k) ?? { amount: 0, count: 0 }; c.amount = r2(c.amount + costNet(d)); c.count++; cat.set(k, c) }
  const costsByCategory = [...cat.entries()].map(([category, c]) => ({ category, amount: c.amount, count: c.count, share: totals.costs > 0 ? Math.round(c.amount / totals.costs * 1000) / 10 : 0 })).sort((a, b) => b.amount - a.amount)
  const biggestCosts = docs.map(d => ({ date: d.expense_date, supplier: d.supplier ?? null, what: d.title ?? '', category: d.expense_category || 'Other', amount: costNet(d) })).sort((a, b) => b.amount - a.amount).slice(0, 10)

  // expected: current managed tenancies × their fee
  const [{ data: tens }, { data: props }] = await Promise.all([
    s.from('tenancies').select('property_id, rent_amount, start_date, end_date, let_cancelled_at, management_fee_type, management_fee_pct, management_fee_fixed').lte('start_date', today).is('let_cancelled_at', null),
    s.from('properties').select('id, letting_type, management_fee_type, management_fee_pct, management_fee_fixed'),
  ])
  const propById = new Map(((props ?? []) as any[]).map(p => [p.id, p]))
  let perMonth = 0, count = 0, noFee = 0
  for (const t of (tens ?? []) as any[]) {
    if (t.end_date && t.end_date < today) continue
    const p = propById.get(t.property_id)
    if (!p || p.letting_type === 'let_only' || demo.has(t.property_id)) continue
    const rent = Number(t.rent_amount) || 0
    const fee = feeAmount(resolveFee(t, p), { received: rent, charged: rent })
    count++
    if (fee == null) { noFee++; continue }
    perMonth = r2(perMonth + fee)
  }

  // VAT once registered: on our fees (output) and on company costs (input, reclaimable)
  const vat = reg ? (() => {
    const onFees = r2(books.rows.filter(r => r.kind === 'fee').reduce((t, r) => t + (r.vat ?? 0), 0))
    const onCosts = r2(docs.filter(d => d.expense_date >= reg.from).reduce((t, d) => t + Number(d.vat_amount || 0), 0))
    return { registeredFrom: reg.from, rate: reg.rate, onFees, onCosts, due: r2(onFees - onCosts) }
  })() : null

  const threshold = { last12: r2(last12.rows.filter(r => r.kind === 'fee').reduce((t, r) => t + r.amount, 0)), limit: VAT_THRESHOLD }
  return { from: o.from, to: o.to, months, totals, costsByCategory, biggestCosts, expected: { perMonth, perYear: r2(perMonth * 12), tenancies: count, noFee }, vat, threshold }
}
