'use client'

// Upkeep by area (6 Nov 2026 — lib/property/upkeep): for each part of the house, when it was last decorated, what's been
// spent each year, and the jobs behind it. Shared by the office (property › Maintenance › Upkeep) and the landlord app.
import { useState } from 'react'

export interface UpkeepData { since: string | null; areas: { key: string; label: string; communal: boolean; total: number; byYear: Record<string, number>; lastDecorated: string | null; lastSpend: string | null; decoratingDue: boolean; lines: { date: string; amount: number; description: string; work: string[] }[] }[] }

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthYear = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const ago = (iso: string) => { const y = (Date.now() - Date.parse(`${iso}T12:00:00Z`)) / (365.25 * 86_400_000); return y < 1 ? 'this year' : `${Math.floor(y)} year${Math.floor(y) === 1 ? '' : 's'} ago` }

export default function UpkeepPanel({ data }: { data: UpkeepData }) {
  const [open, setOpen] = useState<string | null>(null)
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
                <ul className="space-y-0.5 text-xs text-neutral-700">{a.lines.map((l, i) => <li key={i}>{monthYear(l.date)} · {gbp(l.amount)} · {l.description}</li>)}</ul>
              </td></tr>}
            </>))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
