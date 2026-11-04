'use client'

// Finance › Books (4 Nov 2026, Harry: "a view to see all expenses, then all rents received, then all fees charged
// whether they are management or let fees, landlord payments … then deposits received, this needs to be HMRC watertight
// and ready for when we charge a management fee + VAT … easy for us to dump out information for accountants, stuff for
// landlords that is HMRC ready for their end of year"). One screen, five lists and the landlords' year-end, all from
// lib/finance/books — the same figures as each landlord's annual summary and the tax-year report. Every list exports.
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import SubTabs from '@/app/components/SubTabs'
import { adminFetch } from '@/lib/adminFetch'
import { financeTabs } from '@/lib/financeTabs'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import type { BookRow } from '@/lib/finance/books'

type View = 'all' | 'rent' | 'fee' | 'expense' | 'payout' | 'deposit' | 'yearend'
const VIEWS: [View, string][] = [['all', 'All transactions'], ['rent', 'Rent received'], ['fee', 'Agency fees'], ['expense', 'Property expenses'], ['payout', 'Landlord payments'], ['deposit', 'Tenancy deposits'], ['yearend', 'Annual statements']]
interface Data { from: string; to: string; label: string; vat: { from: string; rate: number } | null; rows: BookRow[]; totals: Record<string, number>; feeTotals: { management: number; letting: number; net: number; vat: number }; checks: { level: 'fix' | 'look'; text: string }[]; landlords: { id: string; name: string }[]; properties: { id: string; name: string }[]; categories: Record<string, string[]> }

const gbp = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthName = (m: string | null) => m ? new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const thisTaxYear = () => { const d = new Date(); return d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 6) ? d.getFullYear() : d.getFullYear() - 1 }
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const KIND_LABEL: Record<string, string> = { rent: 'Rent received', fee: 'Agency fee', expense: 'Property expense', payout: 'Landlord payment', deposit: 'Tenancy deposit' }
// quick date picks (4 Nov 2026, Harry: "date range selected easily") — whole calendar months and quarters
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function quickRange(k: string): [string, string] {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth()
  if (k === 'this-month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))]
  if (k === 'last-month') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
  const q = Math.floor(m / 3) * 3
  if (k === 'this-quarter') return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]
  if (k === 'last-quarter') return [iso(new Date(y, q - 3, 1)), iso(new Date(y, q, 0))]
  if (k === 'last-12') return [iso(new Date(y, m - 11, 1)), iso(new Date(y, m + 1, 0))]
  return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))]   // this calendar year
}
const QUICK: [string, string][] = [['this-month', 'This month'], ['last-month', 'Last month'], ['this-quarter', 'This quarter'], ['last-quarter', 'Last quarter'], ['last-12', 'Last 12 months'], ['this-year', 'This calendar year']]

export default function BooksPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const [view, setViewRaw] = useState<View>((VIEWS.some(v => v[0] === one(sp.view)) ? one(sp.view) : 'all') as View)
  const [year, setYear] = useState<number>(Number(one(sp.year)) || thisTaxYear())
  // dates: a tax year, or any from–to (quick picks fill them in)
  const [mode, setMode] = useState<'year' | 'dates'>(one(sp.from) ? 'dates' : 'year')
  const [from, setFrom] = useState(one(sp.from) || quickRange('this-month')[0])
  const [to, setTo] = useState(one(sp.to) || quickRange('this-month')[1])
  const [category, setCategory] = useState('')
  const setView = (v: View) => { setViewRaw(v); setCategory('') }
  const [landlordId, setLandlordId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [q, setQ] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const datesOk = mode === 'year' || (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to)
  const params = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({ ...(mode === 'year' ? { year: String(year) } : { from, to }), ...(landlordId ? { landlordId } : {}), ...(propertyId ? { propertyId } : {}), ...extra }).toString(), [mode, year, from, to, landlordId, propertyId])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const r = await adminFetch(`/api/admin/books?${params()}`)
    const d = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setError(d.error ?? 'The books didn’t load'); return }
    setData(d)
  }, [params])
  useEffect(() => { if (datesOk) load() }, [load, datesOk])

  // CSV or PDF of exactly what's chosen: dates, landlord, property, type and category
  const [making, setMaking] = useState('')
  async function file(format: 'csv' | 'pdf', kind?: string, cat?: string) {
    setMaking(format); setError('')
    const r = await adminFetch(`/api/admin/books?${params({ format, ...(kind && kind !== 'all' ? { kind } : {}), ...(cat ? { category: cat } : {}) })}`)
    setMaking('')
    if (!r.ok) { setError(`The ${format.toUpperCase()} couldn’t be made`); return }
    const name = decodeURIComponent(r.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? `books.${format}`)
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click()
  }
  const csv = (kind?: string) => file('csv', kind)

  const rows = useMemo(() => {
    if (!data || view === 'yearend') return []
    const needle = q.trim().toLowerCase()
    return data.rows.filter(r => (view === 'all' || r.kind === view) && (!category || r.category === category) && (!needle || `${r.property} ${r.landlord} ${r.tenant ?? ''} ${r.room ?? ''} ${r.description} ${r.category} ${r.reference ?? ''}`.toLowerCase().includes(needle)))
  }, [data, view, q, category])
  const cats = data && view !== 'yearend' ? (view === 'all' ? Object.entries(data.categories ?? {}).flatMap(([k, cs]) => cs.map(c => [k, c] as [string, string])) : (data.categories?.[view] ?? []).map(c => [view, c] as [string, string])) : []
  const shownTotal = r2(rows.reduce((t, r) => t + r.amount, 0))

  // the landlords' year-end: one line each, the figures for their tax return
  const yearEnd = useMemo(() => {
    if (!data) return []
    const m = new Map<string, { id: string | null; name: string; rent: number; mgmt: number; letting: number; vat: number; exp: number; paid: number }>()
    for (const r of data.rows) {
      const k = r.landlordId ?? r.landlord
      const x = m.get(k) ?? { id: r.landlordId, name: r.landlord || '—', rent: 0, mgmt: 0, letting: 0, vat: 0, exp: 0, paid: 0 }
      if (r.kind === 'rent') x.rent += r.amount
      if (r.kind === 'fee') { if (r.category === 'letting fee') x.letting += r.amount; else x.mgmt += r.amount; x.vat += r.vat ?? 0 }
      if (r.kind === 'expense') x.exp += r.amount
      if (r.kind === 'payout') x.paid += r.amount
      m.set(k, x)
    }
    return [...m.values()].filter(x => x.rent || x.mgmt || x.letting || x.exp || x.paid).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }, [data])

  const years = Array.from({ length: 4 }, (_, i) => thisTaxYear() - i)
  const sel = 'rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/finance" />} title="Transactions" />
      <PageHero title="Transactions" subtitle={<>Rent received, agency fees, property expenses, landlord payments and tenancy deposits — for HMRC, your accountant and each landlord’s SA105 return. {data ? (data.label ? `Tax year ${data.label}: 6 April ${year} – 5 April ${year + 1}.` : `${day(data.from)} to ${day(data.to)}.`) : ''}</>}
        stats={data ? [
          { label: 'Rent received', value: gbp(data.totals.rent) },
          { label: 'Agency fees', value: gbp(data.totals.fee) },
          { label: 'Property expenses', value: gbp(data.totals.expense) },
          { label: 'Landlord payments', value: gbp(data.totals.payout) },
        ] : undefined}
        tabs={financeTabs('books')} />

      <main className="mx-auto max-w-6xl space-y-md px-lg py-xl">
        <div className="flex flex-wrap items-center gap-sm">
          <div className="flex rounded-xl border border-neutral-200 bg-white p-0.5 text-sm" role="group" aria-label="Dates by">
            {(['year', 'dates'] as const).map(m => <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg px-md py-xs font-semibold ${mode === m ? 'bg-[var(--band,#1F3B2E)] text-white' : 'text-neutral-600'}`}>{m === 'year' ? 'Tax year' : 'Dates'}</button>)}
          </div>
          {mode === 'year' ? (
            <select className={sel} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Tax year">
              {years.map(y => <option key={y} value={y}>Tax year {y}/{String(y + 1).slice(2)}</option>)}
            </select>
          ) : (
            <>
              <input type="date" className={sel} value={from} max={to} onChange={e => setFrom(e.target.value)} aria-label="From" />
              <span className="text-sm text-neutral-500">to</span>
              <input type="date" className={sel} value={to} min={from} onChange={e => setTo(e.target.value)} aria-label="To" />
              <select className={sel} value="" onChange={e => { if (e.target.value) { const [f, t] = quickRange(e.target.value); setFrom(f); setTo(t) } }} aria-label="Quick dates">
                <option value="">Quick pick…</option>{QUICK.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </>
          )}
          <select className={sel} value={landlordId} onChange={e => setLandlordId(e.target.value)} aria-label="Landlord">
            <option value="">Every landlord</option>{data?.landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className={sel} value={propertyId} onChange={e => setPropertyId(e.target.value)} aria-label="Property">
            <option value="">Every property</option>{data?.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" onClick={() => csv()} className="ml-auto rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white">Full transaction export (CSV)</button>
        </div>

        {data && data.checks.length > 0 && (
          <details className="rounded-2xl border border-amber-200 bg-amber-50 px-lg py-sm" open={data.checks.some(c => c.level === 'fix')}>
            <summary className="cursor-pointer text-sm font-bold text-amber-900">{data.checks.length} exception{data.checks.length === 1 ? '' : 's'} to resolve before export</summary>
            <ul className="mt-sm space-y-xs text-sm text-amber-950">{data.checks.map((c, i) => <li key={i} className="flex gap-sm"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.level === 'fix' ? 'bg-red-600' : 'bg-amber-500'}`} />{c.text}</li>)}</ul>
          </details>
        )}

        <SubTabs<View> tabs={VIEWS.map(([k, l]) => [k, data && k !== 'yearend' && k !== 'all' ? `${l} · ${gbp(data.totals[k] ?? 0)}` : l])} active={view} onChange={setView} />
        {!datesOk && <p className="text-sm text-amber-800">Choose a from date on or before the to date.</p>}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{error}</p>}
        {!data ? <p className="text-sm text-neutral-500">{loading ? 'Adding up the books…' : ''}</p> : view === 'yearend' ? (
          <section className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                <th className="px-md py-sm">Landlord</th><th className="px-md py-sm text-right">Rent received</th><th className="px-md py-sm text-right">Management fees</th><th className="px-md py-sm text-right">Letting fees</th>{data.vat && <th className="px-md py-sm text-right">VAT in fees</th>}<th className="px-md py-sm text-right">Property expenses</th><th className="px-md py-sm text-right">Net rental income</th><th className="px-md py-sm text-right">Landlord payments</th><th className="px-md py-sm" />
              </tr></thead>
              <tbody className="tabular-nums">
                {yearEnd.map(x => (
                  <tr key={x.id ?? x.name} className="border-t border-neutral-100">
                    <td className="px-md py-sm font-semibold">{x.id ? <Link href={`/admin/landlord/${x.id}?tab=money`} className="hover:underline">{x.name}</Link> : x.name}</td>
                    <td className="px-md py-sm text-right">{gbp(r2(x.rent))}</td><td className="px-md py-sm text-right">{gbp(r2(x.mgmt))}</td><td className="px-md py-sm text-right">{gbp(r2(x.letting))}</td>
                    {data.vat && <td className="px-md py-sm text-right">{gbp(r2(x.vat))}</td>}
                    <td className="px-md py-sm text-right">{gbp(r2(x.exp))}</td><td className="px-md py-sm text-right font-bold">{gbp(r2(x.rent - x.mgmt - x.letting - x.exp))}</td><td className="px-md py-sm text-right">{gbp(r2(x.paid))}</td>
                    <td className="px-md py-sm text-right">{x.id && mode === 'year' && <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={async () => {
                      const r = await adminFetch(`/api/admin/statements/annual?landlordId=${x.id}&year=${year}`)
                      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'The summary couldn’t be made'); return }
                      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `Annual statement ${data.label} - ${x.name}.pdf`; a.click()
                    }}>Annual statement (PDF)</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-neutral-100 px-md py-sm text-xs text-neutral-500">Net rental income = rent received − agency fees − property expenses (cash basis). Each annual statement shows the same figures by property and by SA105 box.{mode === 'dates' && ' Annual statements are by tax year — switch to Tax year to make them.'}</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-sm border-b border-neutral-100 px-md py-sm">
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search property, tenant, description, reference…" className="min-w-[220px] flex-1 rounded-lg border border-neutral-200 px-sm py-xs text-sm" />
              {cats.length > 1 && (
                <select value={category} onChange={e => setCategory(e.target.value)} className="rounded-lg border border-neutral-200 bg-white px-sm py-xs text-sm" aria-label="Type">
                  <option value="">{view === 'fee' ? 'All fee types' : view === 'expense' ? 'All expense categories' : view === 'deposit' ? 'All deposits' : 'All types'}</option>
                  {cats.map(([k, c]) => <option key={`${k}|${c}`} value={c}>{view === 'all' ? `${KIND_LABEL[k]} — ${c}` : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              )}
              <span className="text-sm text-neutral-700">{rows.length} · <b>{gbp(shownTotal)}</b>{view === 'fee' && data.feeTotals && <> · management {gbp(data.feeTotals.management)} · letting {gbp(data.feeTotals.letting)}{data.vat ? <> · net {gbp(data.feeTotals.net)} · VAT {gbp(data.feeTotals.vat)}</> : ''}</>}</span>
              <button type="button" disabled={!!making} onClick={() => file('csv', view, category)} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold disabled:opacity-50">{making === 'csv' ? 'Making…' : 'CSV'}</button>
              <button type="button" disabled={!!making} onClick={() => file('pdf', view, category)} className="rounded-lg bg-[var(--band,#1F3B2E)] px-md py-xs text-sm font-semibold text-white disabled:opacity-50">{making === 'pdf' ? 'Making…' : 'PDF'}</button>
            </div>
            <div className="max-h-[70dvh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                  <th className="px-md py-sm">{view === 'payout' || view === 'deposit' || view === 'all' ? 'Date' : 'For'}</th><th className="px-md py-sm">Property</th><th className="px-md py-sm">What</th>
                  {view === 'fee' && data.vat && <><th className="px-md py-sm text-right">Net</th><th className="px-md py-sm text-right">VAT</th></>}
                  <th className="px-md py-sm text-right">Amount</th><th className="px-md py-sm">Reference</th>
                </tr></thead>
                <tbody>
                  {rows.slice(0, 1500).map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100 align-top">
                      <td className="whitespace-nowrap px-md py-sm tabular-nums text-neutral-700">{view === 'payout' || view === 'deposit' || view === 'all' ? day(r.date) : monthName(r.month) || day(r.date)}</td>
                      <td className="px-md py-sm"><span className="block font-semibold">{r.property}</span><span className="text-xs text-neutral-500">{r.landlord}</span></td>
                      <td className="px-md py-sm"><span className="block">{r.description}</span><span className="text-xs text-neutral-500">{[view === 'all' ? KIND_LABEL[r.kind] : null, r.category, r.source === 'per statement' ? 'statement total' : null].filter(Boolean).join(' · ')}</span>{r.note && <span className="block text-xs font-semibold text-amber-800">{r.note}</span>}</td>
                      {view === 'fee' && data.vat && <><td className="px-md py-sm text-right tabular-nums">{gbp(r.net ?? r.amount)}</td><td className="px-md py-sm text-right tabular-nums">{gbp(r.vat ?? 0)}</td></>}
                      <td className="whitespace-nowrap px-md py-sm text-right font-semibold tabular-nums">{gbp(r.amount)}</td>
                      <td className="whitespace-nowrap px-md py-sm text-xs text-neutral-600">{r.reference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="px-md py-lg text-sm text-neutral-500">Nothing here for these choices.</p>}
              {rows.length > 1500 && <p className="px-md py-sm text-xs text-neutral-500">Showing the first 1,500 — the CSV has all {rows.length}.</p>}
            </div>
          </section>
        )}

        <VatCard vat={data?.vat ?? null} onSaved={load} />
        <p className="text-xs text-neutral-500">How it’s added up (cash basis): rent and agency fees count in the month the rent is for; landlord payments on the day paid; property expenses are costs paid on a landlord’s behalf and deducted on their statement, plus costs logged here (EXP…) not yet on a statement. Rent received and agency fees are never property expenses. Practice houses are left out. Totals always equal the statements.</p>
      </main>
    </div>
  )
}

// When our fees start carrying VAT — once set, every fee from that date shows net and VAT, on this screen, the CSVs and
// each landlord's annual summary. Administrators only.
function VatCard({ vat, onSaved }: { vat: { from: string; rate: number } | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(vat?.from ?? '')
  const [rate, setRate] = useState(String(vat?.rate ?? 20))
  const [msg, setMsg] = useState('')
  async function save(clear = false) {
    setMsg('')
    const r = await adminFetch('/api/admin/books', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'vat', from: clear ? null : from, rate: Number(rate) }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(d.error ?? 'Not saved'); return }
    setOpen(false); onSaved()
  }
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white px-lg py-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-sm"><b>VAT on our fees:</b> {vat ? `${vat.rate}% from ${new Date(vat.from + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} — fees from then show net and VAT` : 'not registered — fees carry no VAT'}</p>
        <button type="button" onClick={() => setOpen(v => !v)} className="text-sm font-semibold text-blue-700 hover:underline">{open ? 'Close' : 'Change'}</button>
      </div>
      {open && (
        <div className="mt-sm flex flex-wrap items-end gap-sm">
          <label className="text-xs font-bold text-neutral-600">VAT registered from<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-neutral-300 px-sm py-xs text-sm" /></label>
          <label className="text-xs font-bold text-neutral-600">Rate %<input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} className="mt-1 block w-20 rounded-lg border border-neutral-300 px-sm py-xs text-sm" /></label>
          <button type="button" onClick={() => save()} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white">Save</button>
          {vat && <button type="button" onClick={() => save(true)} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">Not registered</button>}
          <p className="w-full text-xs text-neutral-500">Fees charged from that date are treated as including VAT (net and VAT worked out of what was charged). Fees before it are left as they were. Nothing on a statement is changed.</p>
          {msg && <p className="w-full text-sm text-red-700">{msg}</p>}
        </div>
      )}
    </section>
  )
}
