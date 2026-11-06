'use client'

// Upkeep by area (6 Nov 2026 — lib/property/upkeep): for each part of the house, when it was last decorated, what's been
// spent each year, and the jobs behind it. Shared by the office (property › Maintenance › Upkeep) and the landlord app.
import { useState } from 'react'

export interface UpkeepData { since: string | null; areas: { key: string; label: string; communal: boolean; total: number; byYear: Record<string, number>; lastDecorated: string | null; lastSpend: string | null; decoratingDue: boolean; lines: { id: string; source: 'expense' | 'statement'; date: string; amount: number; full: number; description: string; work: string[]; areas: { key: string; label: string }[]; splitSet: boolean }[] }[] }

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthYear = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const ago = (iso: string) => { const y = (Date.now() - Date.parse(`${iso}T12:00:00Z`)) / (365.25 * 86_400_000); return y < 1 ? 'this year' : `${Math.floor(y)} year${Math.floor(y) === 1 ? '' : 's'} ago` }

// onSplit: the office can set how a job naming several areas is divided (left out in the landlord app)
export default function UpkeepPanel({ data, onSplit }: { data: UpkeepData; onSplit?: (line: UpkeepData['areas'][number]['lines'][number], splits: { area: string; amount: number }[]) => Promise<string | null> }) {
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ line: UpkeepData['areas'][number]['lines'][number]; amounts: Record<string, string>; err: string } | null>(null)
  const years = [...new Set(data.areas.flatMap(a => Object.keys(a.byYear)))].sort().slice(-6)
  return (
    <div className="space-y-sm">
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
                  {onSplit && (l.areas.length > 1 || a.key === 'unplaced') && <button type="button" onClick={e => { e.stopPropagation(); setEdit({ line: l, amounts: Object.fromEntries(l.areas.map(x => [x.key, String(l.splitSet ? (data.areas.find(z => z.key === x.key)?.lines.find(z => z.id === l.id)?.amount ?? 0) : Math.round(l.full / l.areas.length * 100) / 100)])), err: '' }) }}
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
