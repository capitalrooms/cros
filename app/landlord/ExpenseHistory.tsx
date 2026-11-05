'use client'

// Costs on your properties, by type, over the years (5 Nov 2026) — e.g. Internet: what was paid each tax year, and
// every charge behind it. The same figures as the statements (GET /api/landlord/expenses).
import { useEffect, useState } from 'react'
import type { ExpenseType } from '@/lib/landlord/expenseHistory'

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const LINE = '#E4E0D8'

export default function ExpenseHistory({ asId }: { asId: string | null }) {
  const [d, setD] = useState<{ types: ExpenseType[]; years: string[]; houses: string[]; total: number } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [house, setHouse] = useState('')
  useEffect(() => {
    fetch(`/api/landlord/expenses${asId ? `?as=${encodeURIComponent(asId)}` : ''}`).then(r => r.ok ? r.json() : null).then(setD).catch(() => setD(null))
  }, [asId])
  if (!d || !d.types.length) return null
  // one house at a time when they have several
  const types = house ? d.types.map(t => {
    const items = t.items.filter(i => i.property === house)
    const sums = items.reduce((m: Record<string, number>, i) => { const ty = taxYear(i.date); m[ty] = Math.round(((m[ty] ?? 0) + i.amount) * 100) / 100; return m }, {})
    const byYear = Object.entries(sums).map(([ty, amount]) => ({ taxYear: ty, amount })).sort((a, b) => b.taxYear.localeCompare(a.taxYear))
    return { ...t, items, byYear, count: items.length, total: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100 }
  }).filter(t => t.count).sort((a, b) => b.total - a.total) : d.types

  return (
    <section className="mx-auto mt-12 max-w-6xl px-6 md:px-14">
      <p className="pub-eyebrow m-0">Your property expenses</p>
      <h2 className="pub-serif m-0 mt-2 text-[28px] leading-tight md:text-[36px]">What’s been spent, by type</h2>
      <p className="pub-muted mt-2 text-[14px]">Every cost on your statements, grouped — internet, cleaning, repairs and so on — with the total for each tax year. Open a type to see each charge.</p>
      {d.houses.length > 1 && (
        <select value={house} onChange={e => setHouse(e.target.value)} className="mt-4 rounded-full border px-4 py-2 text-[14px]" style={{ borderColor: '#111' }} aria-label="Property">
          <option value="">All properties</option>{d.houses.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      )}
      <ul className="m-0 mt-6 list-none p-0" style={{ borderTop: `1px solid ${LINE}` }}>
        {types.map(t => (
          <li key={t.category} style={{ borderBottom: `1px solid ${LINE}` }}>
            <button type="button" onClick={() => setOpen(open === t.category ? null : t.category)} aria-expanded={open === t.category} className="flex w-full flex-wrap items-baseline justify-between gap-3 py-4 text-left">
              <span className="text-[16px] font-semibold">{t.category} <span className="pub-muted text-[13px] font-normal">· {t.count} charge{t.count === 1 ? '' : 's'}</span></span>
              <span className="flex flex-wrap items-baseline gap-4 text-[14px]">
                {t.byYear.slice(0, 3).map(y => <span key={y.taxYear} className="pub-muted">{y.taxYear} <b style={{ color: '#111' }}>{gbp(y.amount)}</b></span>)}
                <span className="text-[16px] font-semibold">{gbp(t.total)}</span>
              </span>
            </button>
            {open === t.category && (
              <ul className="m-0 mb-4 list-none p-0">
                {t.items.map((i, n) => (
                  <li key={n} className="flex flex-wrap justify-between gap-3 py-2 text-[14px]" style={{ borderTop: `1px solid ${LINE}` }}>
                    <span className="min-w-0"><span className="block">{i.description}</span><span className="pub-muted text-[13px]">{[day(i.date), i.property, i.room, i.reference].filter(Boolean).join(' · ')}</span></span>
                    <span className="font-semibold">{gbp(i.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// the UK tax year a date falls in (6 April to 5 April), as "2026/27"
function taxYear(iso: string) { const y = Number(iso.slice(0, 4)); const s = iso.slice(5, 10) >= '04-06' ? y : y - 1; return `${s}/${String(s + 1).slice(2)}` }
