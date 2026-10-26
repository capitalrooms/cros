'use client'

// A house's deep-clean record (26 Oct 2026): each extra job (lib/cleans/deepTasks), when it was last done and whether
// it's due — the same block for the cleaner (house page, a clean) and the office (the property's Maintenance tab).
// Pass `deep` when the screen already has it, or `propertyId` to load it (/api/cleaner/house).
import { useEffect, useState } from 'react'
import { AREAS, type DeepRow } from '@/lib/cleans/deepTasks'

type Deep = { rows: DeepRow[]; others: { job: string; date: string }[] }
const fullDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const STATUS: Record<DeepRow['status'], [string, string]> = {
  due: ['Due', 'bg-amber-100 text-amber-900'],
  soon: ['Due soon', 'bg-neutral-100 text-neutral-700'],
  ok: ['Done', 'bg-green-50 text-green-800'],
  never: ['No record', 'bg-neutral-100 text-neutral-500'],
}

export default function DeepCleanRecord({ deep: given, propertyId, dueOnly = false, title = 'Deep-clean record' }: { deep?: Deep | null; propertyId?: string; dueOnly?: boolean; title?: string }) {
  const [deep, setDeep] = useState<Deep | null>(given ?? null)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { if (given) setDeep(given) }, [given])
  useEffect(() => {
    if (given || !propertyId) return
    fetch(`/api/cleaner/house?propertyId=${propertyId}`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.deep) setDeep(j.deep); else setError(j.error || 'The deep-clean record couldn’t be loaded')
    }).catch(() => setError('The deep-clean record couldn’t be loaded — check the connection.'))
  }, [given, propertyId])

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!deep) return null
  const due = deep.rows.filter(r => r.status === 'due')
  const neverAny = deep.rows.every(r => r.status === 'never')

  if (dueOnly) {
    // a short line for the top of a clean: what's due here, most overdue first (only once there's some history)
    if (neverAny || !due.length) return null
    const top = [...due].sort((a, b) => (b.weeksSince! - b.weeks) - (a.weeksSince! - a.weeks)).slice(0, 4)
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-md">
        <p className="text-sm font-bold text-amber-900">Extra jobs due at this house</p>
        <ul className="mt-xs space-y-0.5 text-sm text-amber-900">
          {top.map(r => <li key={r.label}>{r.label} — last {fullDate(r.last!)}</li>)}
        </ul>
        {due.length > top.length && <p className="mt-xs text-xs text-amber-800">and {due.length - top.length} more — tick what you do when you finish.</p>}
      </div>
    )
  }

  const shown = showAll ? deep.rows : deep.rows.filter(r => r.status !== 'never')
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-sm font-bold text-neutral-900">{title}</h2>
        <span className="text-xs text-neutral-500">{neverAny ? 'Nothing ticked yet' : `${due.length} due`}</span>
      </div>
      <p className="mt-xs text-xs text-neutral-500">The extra jobs ticked when cleans are finished here — when each was last done.</p>
      {neverAny && !showAll ? (
        <p className="mt-sm text-sm text-neutral-600">No extra jobs recorded at this house yet. They appear here once the cleaner ticks them at the end of a clean.</p>
      ) : (
        <div className="mt-sm space-y-md">
          {AREAS.map(area => {
            const rows = shown.filter(r => r.area === area)
            if (!rows.length) return null
            return (
              <div key={area}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{area}</p>
                <ul className="mt-xs divide-y divide-neutral-100">
                  {rows.map(r => {
                    const [label, tone] = STATUS[r.status]
                    return (
                      <li key={r.label} className="flex items-center justify-between gap-sm py-1.5 text-sm">
                        <span className="min-w-0 flex-1 text-neutral-900">{r.label}</span>
                        <span className="shrink-0 text-xs text-neutral-500 tabular-nums">{r.last ? fullDate(r.last) : '—'}</span>
                        <span className={`w-[76px] shrink-0 rounded-full px-sm py-0.5 text-center text-[11px] font-bold ${tone}`}>{label}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
          {deep.others.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Other extra jobs</p>
              <ul className="mt-xs space-y-0.5 text-sm text-neutral-700">{deep.others.map((o, i) => <li key={i}>{o.job} <span className="text-xs text-neutral-500">· {fullDate(o.date)}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
      <button type="button" onClick={() => setShowAll(v => !v)} className="mt-sm text-xs font-semibold text-neutral-700 underline underline-offset-2">
        {showAll ? 'Show only what’s been done' : 'Show every job, including ones with no record'}
      </button>
    </section>
  )
}
