// A landlord's costs over the years, by type (5 Nov 2026, Harry: "the landlord can come back in two years time and see
// that internet charge and what he has paid for internet for years to come"). From the books (lib/finance/books), so
// it's the same as their statements: lines on statements imported from the old system and expenses logged in CROS
// (office account, Quick add, Capture, contractor invoices), each under its category, by UK tax year.
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadBooks } from '@/lib/finance/books'

export interface ExpenseType {
  category: string; total: number; count: number
  byYear: { taxYear: string; amount: number }[]
  items: { date: string; property: string; room: string | null; description: string; amount: number; reference: string | null }[]
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function expenseHistory(s: SupabaseClient, landlordId: string): Promise<{ types: ExpenseType[]; years: string[]; houses: string[]; total: number }> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const books = await loadBooks(s, { from: '2015-01-01', to: today, landlordId })
  const rows = books.rows.filter(r => r.kind === 'expense' && r.amount > 0)
  const m = new Map<string, ExpenseType>()
  for (const r of rows) {
    const k = r.category || 'Other'
    const t = m.get(k) ?? { category: k, total: 0, count: 0, byYear: [], items: [] }
    t.total = r2(t.total + r.amount); t.count++
    const y = t.byYear.find(x => x.taxYear === r.taxYear)
    if (y) y.amount = r2(y.amount + r.amount); else t.byYear.push({ taxYear: r.taxYear, amount: r.amount })
    t.items.push({ date: r.date, property: r.property, room: r.room, description: r.description, amount: r.amount, reference: r.reference })
    m.set(k, t)
  }
  const types = [...m.values()].map(t => ({ ...t, byYear: t.byYear.sort((a, b) => b.taxYear.localeCompare(a.taxYear)), items: t.items.sort((a, b) => b.date.localeCompare(a.date)) })).sort((a, b) => b.total - a.total)
  return { types, years: [...new Set(rows.map(r => r.taxYear))].sort().reverse(), houses: [...new Set(rows.map(r => r.property))].sort(), total: r2(rows.reduce((t, r) => t + r.amount, 0)) }
}
