'use client'

// ‹ November 2026 › for the dark band (components/PageHero) — previous, pick, next. One quiet pill (5 Nov 2026, Harry:
// "tiny lines … looks like it's all being made still"): no outlines inside it; the month is a button that opens the
// browser's month chooser on a hidden month input.
import { useRef } from 'react'

const shift = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7) }
const label = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default function HeroMonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const arrow = 'grid h-8 w-8 place-items-center rounded-full text-base text-[#F6F3EC]/80 transition-colors hover:bg-[#F6F3EC]/12 hover:text-[#F6F3EC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F6F3EC]/60'
  return (
    <span className="inline-flex items-center rounded-full bg-[#F6F3EC]/[0.08] p-0.5">
      <button type="button" onClick={() => onChange(shift(month, -1))} className={arrow} aria-label={`Previous month: ${label(shift(month, -1))}`}>‹</button>
      <span className="relative">
        <button type="button" onClick={() => { try { input.current?.showPicker() } catch { input.current?.focus() } }}
          className="rounded-full px-md py-1 text-sm font-semibold text-[#F6F3EC] hover:bg-[#F6F3EC]/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F6F3EC]/60" aria-label={`Choose a month — showing ${label(month)}`}>
          {label(month)}
        </button>
        <input ref={input} type="month" value={month} onChange={e => e.target.value && onChange(e.target.value)} tabIndex={-1} aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />
      </span>
      <button type="button" onClick={() => onChange(shift(month, 1))} className={arrow} aria-label={`Next month: ${label(shift(month, 1))}`}>›</button>
    </span>
  )
}
