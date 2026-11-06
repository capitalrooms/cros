'use client'

// Upkeep by area (6 Nov 2026 — lib/property/upkeep): for each part of the house, when it was last decorated, what's been
// spent each year, and the jobs behind it. Shared by the office (property › Maintenance › Upkeep) and the landlord app.
import { useState } from 'react'

export interface UpkeepData { since: string | null; areas: { key: string; label: string; communal: boolean; total: number; byYear: Record<string, number>; lastDecorated: string | null; lastSpend: string | null; decoratingDue: boolean; lines: { id: string; source: 'expense' | 'statement'; date: string; amount: number; full: number; description: string; work: string[]; areas: { key: string; label: string }[]; splitSet: boolean }[] }[] }

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthYear = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const ago = (iso: string) => { const y = (Date.now() - Date.parse(`${iso}T12:00:00Z`)) / (365.25 * 86_400_000); return y < 1 ? 'this year' : `${Math.floor(y)} year${Math.floor(y) === 1 ? '' : 's'} ago` }

// onSplit: the office can set how a job naming several areas is divided (left out in the landlord app)
export default function UpkeepPanel({ data, onSplit, onSuggest }: { data: UpkeepData; onSplit?: (line: UpkeepData['areas'][number]['lines'][number], splits: { area: string; amount: number }[]) => Promise<string | null>; onSuggest?: (line: UpkeepData['areas'][number]['lines'][number]) => Promise<{ splits: { area: string; amount: number }[]; why: string; fromInvoice: boolean } | string> }) {
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ line: UpkeepData['areas'][number]['lines'][number]; amounts: Record<string, string>; err: string; why?: string } | null>(null)
  const [thinking, setThinking] = useState(false)
  // every job still split by guesswork: shared between areas with no split set, or not placed at all — one list
  const toSort = (() => {
    const seen = new Map<string, UpkeepData['areas'][number]['lines'][number] & { unplaced: boolean }>()
    for (const a of data.areas) for (const l of a.lines) if (!l.splitSet && (l.areas.length > 1 || a.key === 'unplaced') && !seen.has(l.id)) seen.set(l.id, { ...l, unplaced: a.key === 'unplaced' })
    return [...seen.values()].sort((x, y) => y.full - x.full)
  })()
  const openEdit = (l: UpkeepData['areas'][number]['lines'][number]) => setEdit({ line: l, amounts: Object.fromEntries(l.areas.map(x => [x.key, String(l.splitSet ? (data.areas.find(z => z.key === x.key)?.lines.find(z => z.id === l.id)?.amount ?? 0) : Math.round(l.full / l.areas.length * 100) / 100)])), err: '' })
  async function suggest() {
    if (!edit || !onSuggest) return
    setThinking(true)
    const r = await onSuggest(edit.line)
    setThinking(false)
    if (typeof r === 'string') { setEdit({ ...edit, err: r }); return }
    setEdit({ ...edit, amounts: Object.fromEntries(r.splits.map(x => [x.area, String(x.amount)])), err: '', why: `${r.fromInvoice ? 'From the invoice: ' : 'Estimate: '}${r.why}` })
  }
  const years = [...new Set(data.areas.flatMap(a => Object.keys(a.byYear)))].sort().slice(-6)
  return (
    <div className="space-y-sm">
      {onSplit && toSort.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-md">
          <p className="text-sm font-semibold text-amber-900">To sort · {toSort.length}</p>
          <p className="text-xs text-amber-900/80">Jobs covering more than one part of the house (split equally for now), or not placed anywhere. Open one, let the AI suggest the split from the invoice, and accept or change it.</p>
          <ul className="mt-xs divide-y divide-amber-200/60 text-xs">
            {toSort.slice(0, 15).map(l => (
              <li key={l.id} className="flex items-center justify-between gap-sm py-xs">
                <span className="min-w-0"><span className="font-semibold">{gbp(l.full)}</span> · {monthYear(l.date)} · {l.description}<span className="block text-amber-900/70">{l.unplaced ? 'Not placed' : l.areas.map(a => a.label).join(' + ')}</span></span>
                <button type="button" onClick={() => openEdit(l)} className="shrink-0 rounded-lg border border-amber-300 bg-white px-sm py-0.5 font-semibold text-amber-900 hover:bg-amber-100">Sort</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-neutral-500">From the expenses and statements on record{data.since ? ` since ${monthYear(data.since)}` : ''}. Jobs naming more than one part of the house are shared between them.</p>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wider text-neutral-500">
            <th className="px-md py-sm font-bold">Area</th><th className="px-md py-sm font-bold">Last decorated</th>
            {years.map(y => <th key={y} className="px-md py-sm text-right font-bold">{y}</th>)}
            <th className="px-md py-sm text-right font-bold">Total</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {data.areas.map(a => (<>
              <tr key={a.key} className={a.lines.length ? 'cursor-pointer hover:bg-neutral-50' : ''} onClick={() => a.lines.length && setOpen(open === a.key ? null : a.key)}>
                <td className="px-md py-sm"><span className="font-semibold text-neutral-900">{a.label}</span>{a.communal && <span className="ml-xs text-[11px] text-neutral-500">shared</span>}</td>
                <td className="px-md py-sm">{a.lastDecorated ? <span>{monthYear(a.lastDecorated)} <span className="text-xs text-neutral-500">· {ago(a.lastDecorated)}</span></span>
                  : a.decoratingDue ? <span className="text-amber-800">Nothing on record{data.since ? ` since ${monthYear(data.since)}` : ''}</span> : <span className="text-neutral-400">—</span>}
                  {a.decoratingDue && a.lastDecorated && <span className="ml-xs rounded-full bg-amber-100 px-xs text-[10px] font-bold uppercase text-amber-900">Worth a look</span>}</td>
                {years.map(y => <td key={y} className="px-md py-sm text-right tabular-nums text-neutral-700">{a.byYear[y] ? gbp(a.byYear[y]) : ''}</td>)}
                <td className="px-md py-sm text-right font-semibold tabular-nums">{a.total ? gbp(a.total) : '—'}</td>
              </tr>
              {open === a.key && <tr key={`${a.key}-lines`}><td colSpan={years.length + 3} className="bg-neutral-50 px-md py-sm">
                <ul className="space-y-0.5 text-xs text-neutral-700">{a.lines.map((l, i) => <li key={i}>{monthYear(l.date)} · {gbp(l.amount)}{l.areas.length > 1 ? ` of ${gbp(l.full)}` : ''} · {l.description}
                  {onSplit && (l.areas.length > 1 || a.key === 'unplaced') && <button type="button" onClick={e => { e.stopPropagation(); openEdit(l) }}
                    className="ml-xs font-semibold text-blue-700 hover:underline">{a.key === 'unplaced' ? 'Place it' : l.splitSet ? 'Split set — change' : `Shared between ${l.areas.length} — set the split`}</button>}</li>)}</ul>
              </td></tr>}
            </>))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-lg" onClick={() => setEdit(null)}>
          <div className="w-full max-w-md space-y-sm rounded-2xl bg-white p-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-neutral-900">Split {gbp(edit.line.full)}</h3>
            <p className="text-xs text-neutral-500">{edit.line.description}</p>
            {/* add any other part of the house to this job */}
            <select className="w-full rounded-lg border border-neutral-300 px-sm py-xs text-sm" value="" onChange={e => {
              const k = e.target.value; if (!k) return
              const label = data.areas.find(z => z.key === k)?.label ?? k
              setEdit({ ...edit, line: { ...edit.line, areas: [...edit.line.areas.filter(z => z.key !== 'unplaced'), { key: k, label }] }, amounts: { ...edit.amounts, [k]: edit.amounts[k] ?? '0' } })
            }}>
              <option value="">+ Add a part of the house…</option>
              {data.areas.filter(z => z.key !== 'unplaced' && !edit.line.areas.some(y => y.key === z.key)).map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
            </select>
            {edit.line.areas.map(x => (
              <label key={x.key} className="flex items-center justify-between gap-sm text-sm"><span>{x.label}</span>
                <input type="number" step="0.01" className="w-28 rounded-lg border border-neutral-300 px-sm py-xs text-right" value={edit.amounts[x.key] ?? ''} onChange={e => setEdit({ ...edit, amounts: { ...edit.amounts, [x.key]: e.target.value }, err: '' })} /></label>
            ))}
            <div className="flex flex-wrap gap-xs text-xs">
              <button type="button" className="rounded-full border px-sm py-0.5" onClick={() => setEdit({ ...edit, amounts: Object.fromEntries(edit.line.areas.map(x => [x.key, String(Math.round(edit.line.full / edit.line.areas.length * 100) / 100)])) })}>Equal</button>
              {edit.line.areas.length === 2 && <button type="button" className="rounded-full border px-sm py-0.5" onClick={() => setEdit({ ...edit, amounts: { [edit.line.areas[0].key]: String(Math.round(edit.line.full * 2 / 3 * 100) / 100), [edit.line.areas[1].key]: String(Math.round(edit.line.full / 3 * 100) / 100) } })}>⅔ / ⅓</button>}
              {edit.line.areas.length === 2 && <button type="button" className="rounded-full border px-sm py-0.5" onClick={() => setEdit({ ...edit, amounts: { [edit.line.areas[0].key]: String(Math.round(edit.line.full / 3 * 100) / 100), [edit.line.areas[1].key]: String(Math.round(edit.line.full * 2 / 3 * 100) / 100) } })}>⅓ / ⅔</button>}
            </div>
            {onSuggest && <button type="button" disabled={thinking} onClick={suggest} className="rounded-lg border border-neutral-300 px-sm py-xs text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50">{thinking ? 'Reading the invoice…' : 'Suggest the split'}</button>}
            {edit.why && <p className="text-xs text-neutral-600">{edit.why}</p>}
            {edit.err && <p className="text-xs text-red-700">{edit.err}</p>}
            <div className="flex gap-sm pt-xs">
              <button type="button" className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white" onClick={async () => { const err = await onSplit!(edit.line, edit.line.areas.map(x => ({ area: x.key, amount: Number(edit.amounts[x.key] || 0) }))); if (err) setEdit({ ...edit, err }); else setEdit(null) }}>Save</button>
              {edit.line.splitSet && <button type="button" className="text-sm font-semibold text-neutral-600 underline" onClick={async () => { await onSplit!(edit.line, []); setEdit(null) }}>Back to equal</button>}
              <button type="button" className="text-sm font-semibold text-neutral-600 underline" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
