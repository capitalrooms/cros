'use client'
// VAT (13 Nov 2026) — the VAT charged on our fees each quarter (as the statements show it) and the VAT paid on company
// costs, laid out as the VAT return boxes, with every line underneath and a spreadsheet to send the accountant.
// Directors only. /api/admin/books/vat, lib/finance/vatReturn.
import { useCallback, useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import PageHero from '@/components/PageHero'
import { financeTabs } from '@/lib/financeTabs'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'

type Settings = { from: string; rate: number; quarterEnds: 1 | 2 | 3; vatNumber: string | null; set: boolean }
type Period = { from: string; to: string; label: string }
type Detail = {
  boxes: { box1: number; box4: number; box5: number; box6: number; box7: number }
  statements: { reference: string; landlord: string; property: string; month: string | null; net: number; vat: number }[]
  feeLines: { date: string; landlord: string; property: string; reference: string | null; description: string; net: number; vat: number }[]
  costLines: { date: string; supplier: string; description: string; category: string; gross: number; vat: number }[]
}
const gbp = (n: number) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const QUARTERS: [1 | 2 | 3, string][] = [[1, 'January, April, July and October'], [2, 'February, May, August and November'], [3, 'March, June, September and December']]

export default function VatPage() {
  const [st, setSt] = useState<Settings | null>(null)
  const [periods, setPeriods] = useState<Period[]>([])
  const [pick, setPick] = useState<Period | null>(null)
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ from: '', quarterEnds: 1 as 1 | 2 | 3, vatNumber: '' })
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/books/vat')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Couldn’t load'); return }
    setSt(j.settings); setPeriods(j.periods ?? [])
    setForm({ from: j.settings.from, quarterEnds: j.settings.quarterEnds, vatNumber: j.settings.vatNumber ?? '' })
    setPick(p => p ?? j.periods?.[0] ?? null)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!pick) return
    setD(null)
    adminFetch(`/api/admin/books/vat?from=${pick.from}&to=${pick.to}`).then(r => r.json()).then(setD).catch(() => setErr('Couldn’t load that quarter'))
  }, [pick])

  async function save() {
    setMsg('')
    const r = await adminFetch('/api/admin/books/vat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, rate: 20 }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(j.error || 'Couldn’t save'); return }
    setEdit(false); setPick(null); setMsg('Saved.'); load()
  }

  const noVat = (d?.statements ?? []).filter(x => x.net > 0 && x.vat === 0)
  const Box = ({ n, label, v, strong }: { n: number; label: string; v: number; strong?: boolean }) => (
    <div className={`rounded-xl p-md ${strong ? 'bg-neutral-900 text-white' : 'bg-white ring-1 ring-neutral-200'}`}>
      <p className={`text-[11px] font-bold uppercase tracking-wider ${strong ? 'text-neutral-300' : 'text-neutral-500'}`}>Box {n}</p>
      <p className="text-xl font-bold tabular-nums">{gbp(v)}</p>
      <p className={`text-xs ${strong ? 'text-neutral-300' : 'text-neutral-600'}`}>{label}</p>
    </div>
  )

  return (
    <div className="min-h-screen fin pb-3xl">
      <AppBar left={<BackButton href="/admin/books" label="Transactions" />} />
      <PageHero look="olive" eyebrow="Finance" title="VAT" subtitle="The VAT on our fees each quarter, as the statements show it, and the VAT paid on company costs — ready for the return." tabs={financeTabs('books')} />
      <main className="mx-auto max-w-6xl px-lg py-lg space-y-lg">
        {err && <p className="rounded-lg bg-red-50 px-md py-sm text-sm text-red-800">{err}</p>}
        {st && (
          <section className="rounded-xl bg-white p-md ring-1 ring-neutral-200">
            {!edit ? (
              <div className="flex flex-wrap items-center justify-between gap-sm text-sm">
                <p className="text-neutral-800">VAT registered from <b>{new Date(`${st.from}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</b> · {st.rate}% · quarters end {QUARTERS.find(q => q[0] === st.quarterEnds)?.[1]} · VAT number {st.vatNumber ? <b>{st.vatNumber}</b> : <span className="text-amber-700">not entered</span>}
                  {!st.set && <span className="block text-xs text-amber-700">Not confirmed yet — using 1 November 2026, when VAT first appears on the statements. Check and save the details.</span>}</p>
                <button type="button" onClick={() => setEdit(true)} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">{st.set ? 'Change' : 'Confirm the details'}</button>
              </div>
            ) : (
              <div className="grid gap-sm sm:grid-cols-3">
                <label className="text-xs font-bold text-neutral-600">VAT registered from<input type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} className="mt-1 block w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" /></label>
                <label className="text-xs font-bold text-neutral-600">Your VAT quarters end in<select value={form.quarterEnds} onChange={e => setForm({ ...form, quarterEnds: Number(e.target.value) as 1 | 2 | 3 })} className="mt-1 block w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm">{QUARTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="text-xs font-bold text-neutral-600">VAT registration number<input value={form.vatNumber} onChange={e => setForm({ ...form, vatNumber: e.target.value })} placeholder="GB 123 4567 89" className="mt-1 block w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" /></label>
                <p className="text-xs text-neutral-500 sm:col-span-3">Your quarters are on the VAT registration letter from HMRC (and in your HMRC business account). The number prints on agreements, statements and invoices.</p>
                <div className="flex gap-sm sm:col-span-3"><button type="button" onClick={save} className="rounded-lg bg-neutral-900 px-lg py-xs text-sm font-semibold text-white">Save</button><button type="button" onClick={() => setEdit(false)} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">Cancel</button></div>
              </div>
            )}
            {msg && <p className="mt-xs text-xs text-neutral-700">{msg}</p>}
          </section>
        )}

        {periods.length > 0 && (
          <div className="flex flex-wrap items-center gap-xs">
            {periods.map(p => <button key={p.from} type="button" onClick={() => setPick(p)} className={`rounded-full px-md py-xs text-sm font-semibold ${pick?.from === p.from ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-700'}`}>{p.label}</button>)}
            {pick && <button type="button" onClick={() => downloadPdf(`/api/admin/books/vat?from=${pick.from}&to=${pick.to}&csv=1`, `VAT ${pick.from} to ${pick.to}.csv`)} className="ml-auto rounded-lg bg-neutral-900 px-md py-sm text-sm font-semibold text-white">Download for the accountant (CSV)</button>}
          </div>
        )}

        {pick && !d && <p className="text-sm text-neutral-500">Adding it up…</p>}
        {d && (<>
          <div className="grid gap-sm sm:grid-cols-3 lg:grid-cols-5">
            <Box n={1} label="VAT on our fees" v={d.boxes.box1} />
            <Box n={4} label="VAT paid on company costs" v={d.boxes.box4} />
            <Box n={5} label={d.boxes.box5 >= 0 ? 'To pay HMRC' : 'HMRC owes you'} v={d.boxes.box5} strong />
            <Box n={6} label="Fees, before VAT" v={d.boxes.box6} />
            <Box n={7} label="Company costs, before VAT" v={d.boxes.box7} />
          </div>
          <p className="text-xs text-neutral-500">The fees are those on each landlord statement for rent in this period, with the VAT the statement shows. Company costs are those filed with a VAT amount from the receipt (Office account). Your accountant files the return — this is what goes in it.</p>

          {noVat.length > 0 && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-md text-sm text-amber-950">
              <p className="font-bold">{noVat.length} statement{noVat.length === 1 ? '' : 's'} with fees but no VAT</p>
              <p className="mt-xs">Either no VAT was charged on these, or it was missed when the statement was read. Check each against its PDF in Statements in.</p>
              <ul className="mt-xs list-disc pl-lg">{noVat.map(x => <li key={x.reference + x.property}>{x.property} — {x.reference} ({gbp(x.net)} of fees)</li>)}</ul>
            </div>
          )}

          <section className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
            <p className="border-b border-neutral-100 px-md py-sm text-sm font-bold">By statement</p>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500"><th className="px-md py-xs">Landlord</th><th className="px-sm py-xs">Property</th><th className="px-sm py-xs">Statement</th><th className="px-sm py-xs text-right">Fees</th><th className="px-md py-xs text-right">VAT</th></tr></thead>
              <tbody>{d.statements.map(x => (
                <tr key={x.reference + x.property} className="border-t border-neutral-100"><td className="px-md py-xs">{x.landlord}</td><td className="px-sm py-xs">{x.property}</td><td className="px-sm py-xs">{x.reference}</td><td className="px-sm py-xs text-right tabular-nums">{gbp(x.net)}</td><td className={`px-md py-xs text-right tabular-nums ${x.vat === 0 && x.net > 0 ? 'font-semibold text-amber-700' : ''}`}>{gbp(x.vat)}</td></tr>
              ))}
              <tr className="border-t-2 border-neutral-900 font-bold"><td className="px-md py-xs" colSpan={3}>Total</td><td className="px-sm py-xs text-right tabular-nums">{gbp(d.boxes.box6)}</td><td className="px-md py-xs text-right tabular-nums">{gbp(d.boxes.box1)}</td></tr>
              </tbody>
            </table></div>
          </section>

          {d.costLines.length > 0 && (
            <section className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
              <p className="border-b border-neutral-100 px-md py-sm text-sm font-bold">Company costs</p>
              <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{d.costLines.map((c, i) => (
                <tr key={i} className="border-t border-neutral-100 first:border-0"><td className="px-md py-xs whitespace-nowrap">{new Date(`${c.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td><td className="px-sm py-xs">{c.supplier || c.description}</td><td className="px-sm py-xs text-right tabular-nums">{gbp(c.gross)}</td><td className="px-md py-xs text-right tabular-nums">{gbp(c.vat)}</td></tr>
              ))}</tbody></table></div>
            </section>
          )}
        </>)}
      </main>
    </div>
  )
}
