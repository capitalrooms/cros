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

type View = 'rent' | 'fee' | 'expense' | 'payout' | 'deposit' | 'yearend'
const VIEWS: [View, string][] = [['rent', 'Rent received'], ['fee', 'Fees'], ['expense', 'Expenses'], ['payout', 'Paid to landlords'], ['deposit', 'Deposits'], ['yearend', 'Landlords’ year-end']]
interface Data { from: string; to: string; label: string; vat: { from: string; rate: number } | null; rows: BookRow[]; totals: Record<string, number>; feeTotals: { management: number; letting: number; net: number; vat: number }; checks: { level: 'fix' | 'look'; text: string }[]; landlords: { id: string; name: string }[]; properties: { id: string; name: string }[] }

const gbp = (n: number) => (n < 0 ? '−£' : '£') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthName = (m: string | null) => m ? new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const thisTaxYear = () => { const d = new Date(); return d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 6) ? d.getFullYear() : d.getFullYear() - 1 }
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export default function BooksPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const [view, setView] = useState<View>((VIEWS.some(v => v[0] === one(sp.view)) ? one(sp.view) : 'rent') as View)
  const [year, setYear] = useState<number>(Number(one(sp.year)) || thisTaxYear())
  const [landlordId, setLandlordId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [q, setQ] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const params = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({ year: String(year), ...(landlordId ? { landlordId } : {}), ...(propertyId ? { propertyId } : {}), ...extra }).toString(), [year, landlordId, propertyId])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const r = await adminFetch(`/api/admin/books?${params()}`)
    const d = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setError(d.error ?? 'The books didn’t load'); return }
    setData(d)
  }, [params])
  useEffect(() => { load() }, [load])

  async function csv(kind?: string) {
    const r = await adminFetch(`/api/admin/books?${params({ format: 'csv', ...(kind ? { kind } : {}) })}`)
    if (!r.ok) { setError('The CSV couldn’t be made'); return }
    const name = decodeURIComponent(r.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? 'books.csv')
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click()
  }

  const rows = useMemo(() => {
    if (!data || view === 'yearend') return []
    const needle = q.trim().toLowerCase()
    return data.rows.filter(r => r.kind === view && (!needle || `${r.property} ${r.landlord} ${r.tenant ?? ''} ${r.room ?? ''} ${r.description} ${r.category} ${r.reference ?? ''}`.toLowerCase().includes(needle)))
  }, [data, view, q])
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
    return [...m.values()].filter(x => x.rent || x.mgmt || x.letting || x.exp || x.paid).sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const years = Array.from({ length: 4 }, (_, i) => thisTaxYear() - i)
  const sel = 'rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/finance" />} title="Books" />
      <PageHero title="Books" subtitle={<>Every rent received, fee, expense, payment to a landlord and deposit — for HMRC, your accountant and each landlord’s tax return. {data ? `Tax year ${data.label}: 6 April ${year} – 5 April ${year + 1}.` : ''}</>}
        stats={data ? [
          { label: 'Rent received', value: gbp(data.totals.rent) },
          { label: 'Our fees', value: gbp(data.totals.fee) },
          { label: 'Expenses', value: gbp(data.totals.expense) },
          { label: 'Paid to landlords', value: gbp(data.totals.payout) },
        ] : undefined}
        tabs={financeTabs('books')} />

      <main className="mx-auto max-w-6xl space-y-md px-lg py-xl">
        <div className="flex flex-wrap items-center gap-sm">
          <select className={sel} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Tax year">
            {years.map(y => <option key={y} value={y}>Tax year {y}/{String(y + 1).slice(2)}</option>)}
          </select>
          <select className={sel} value={landlordId} onChange={e => setLandlordId(e.target.value)} aria-label="Landlord">
            <option value="">Every landlord</option>{data?.landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className={sel} value={propertyId} onChange={e => setPropertyId(e.target.value)} aria-label="Property">
            <option value="">Every property</option>{data?.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" onClick={() => csv()} className="ml-auto rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white">Everything for the accountant (CSV)</button>
        </div>

        {data && data.checks.length > 0 && (
          <details className="rounded-2xl border border-amber-200 bg-amber-50 px-lg py-sm" open={data.checks.some(c => c.level === 'fix')}>
            <summary className="cursor-pointer text-sm font-bold text-amber-900">{data.checks.length} thing{data.checks.length === 1 ? '' : 's'} to check before this goes to an accountant</summary>
            <ul className="mt-sm space-y-xs text-sm text-amber-950">{data.checks.map((c, i) => <li key={i} className="flex gap-sm"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.level === 'fix' ? 'bg-red-600' : 'bg-amber-500'}`} />{c.text}</li>)}</ul>
          </details>
        )}

        <SubTabs<View> tabs={VIEWS.map(([k, l]) => [k, data && k !== 'yearend' ? `${l} · ${gbp(data.totals[k] ?? 0)}` : l])} active={view} onChange={setView} />
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{error}</p>}
        {!data ? <p className="text-sm text-neutral-500">{loading ? 'Adding up the books…' : ''}</p> : view === 'yearend' ? (
          <section className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                <th className="px-md py-sm">Landlord</th><th className="px-md py-sm text-right">Rent</th><th className="px-md py-sm text-right">Management fees</th><th className="px-md py-sm text-right">Letting fees</th>{data.vat && <th className="px-md py-sm text-right">VAT in fees</th>}<th className="px-md py-sm text-right">Expenses</th><th className="px-md py-sm text-right">Net income</th><th className="px-md py-sm text-right">Paid to them</th><th className="px-md py-sm" />
              </tr></thead>
              <tbody className="tabular-nums">
                {yearEnd.map(x => (
                  <tr key={x.id ?? x.name} className="border-t border-neutral-100">
                    <td className="px-md py-sm font-semibold">{x.id ? <Link href={`/admin/landlord/${x.id}?tab=money`} className="hover:underline">{x.name}</Link> : x.name}</td>
                    <td className="px-md py-sm text-right">{gbp(r2(x.rent))}</td><td className="px-md py-sm text-right">{gbp(r2(x.mgmt))}</td><td className="px-md py-sm text-right">{gbp(r2(x.letting))}</td>
                    {data.vat && <td className="px-md py-sm text-right">{gbp(r2(x.vat))}</td>}
                    <td className="px-md py-sm text-right">{gbp(r2(x.exp))}</td><td className="px-md py-sm text-right font-bold">{gbp(r2(x.rent - x.mgmt - x.letting - x.exp))}</td><td className="px-md py-sm text-right">{gbp(r2(x.paid))}</td>
                    <td className="px-md py-sm text-right">{x.id && <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={async () => {
                      const r = await adminFetch(`/api/admin/statements/annual?landlordId=${x.id}&year=${year}`)
                      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'The summary couldn’t be made'); return }
                      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `Annual summary ${data.label} - ${x.name}.pdf`; a.click()
                    }}>Annual summary (PDF)</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-neutral-100 px-md py-sm text-xs text-neutral-500">Net income = rent − our fees − expenses: what goes on their property income return. Each annual summary shows the same figures by property and by type of expense.</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-sm border-b border-neutral-100 px-md py-sm">
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search property, tenant, description, reference…" className="min-w-[220px] flex-1 rounded-lg border border-neutral-200 px-sm py-xs text-sm" />
              <span className="text-sm text-neutral-700">{rows.length} · <b>{gbp(shownTotal)}</b>{view === 'fee' && data.feeTotals && <> · management {gbp(data.feeTotals.management)} · letting {gbp(data.feeTotals.letting)}{data.vat ? <> · net {gbp(data.feeTotals.net)} · VAT {gbp(data.feeTotals.vat)}</> : ''}</>}</span>
              <button type="button" onClick={() => csv(view)} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">CSV</button>
            </div>
            <div className="max-h-[70dvh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                  <th className="px-md py-sm">{view === 'payout' || view === 'deposit' ? 'Date' : 'For'}</th><th className="px-md py-sm">Property</th><th className="px-md py-sm">What</th>
                  {view === 'fee' && data.vat && <><th className="px-md py-sm text-right">Net</th><th className="px-md py-sm text-right">VAT</th></>}
                  <th className="px-md py-sm text-right">Amount</th><th className="px-md py-sm">Reference</th>
                </tr></thead>
                <tbody>
                  {rows.slice(0, 1500).map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100 align-top">
                      <td className="whitespace-nowrap px-md py-sm tabular-nums text-neutral-700">{view === 'payout' || view === 'deposit' ? day(r.date) : monthName(r.month) || day(r.date)}</td>
                      <td className="px-md py-sm"><span className="block font-semibold">{r.property}</span><span className="text-xs text-neutral-500">{r.landlord}</span></td>
                      <td className="px-md py-sm"><span className="block">{r.description}</span><span className="text-xs text-neutral-500">{[r.category, r.source === 'per statement' ? 'statement total' : null].filter(Boolean).join(' · ')}</span>{r.note && <span className="block text-xs font-semibold text-amber-800">{r.note}</span>}</td>
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
        <p className="text-xs text-neutral-500">How it’s added up: rent and fees count in the month the rent is for; payments to landlords on the day paid; expenses are what was spent on a property and charged back, plus costs logged here (EXP…) not yet on a statement. Rent received and our fees are never expenses. Practice houses are left out. Totals always equal the statements.</p>
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
