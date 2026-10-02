'use client'

// ‹ month › for the dark band (components/PageHero) — previous, pick, next.
const shift = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7) }

export default function HeroMonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const btn = 'rounded-xl border border-[#F6F3EC]/25 px-md py-xs text-sm text-[#F6F3EC] hover:bg-[#F6F3EC]/10'
  return (
    <span className="inline-flex items-center gap-sm">
      <button type="button" onClick={() => onChange(shift(month, -1))} className={btn} aria-label="Previous month">‹</button>
      <input type="month" value={month} onChange={e => e.target.value && onChange(e.target.value)} aria-label="Month"
        className="rounded-xl border border-[#F6F3EC]/25 bg-transparent px-md py-xs text-sm text-[#F6F3EC] [color-scheme:dark]" />
      <button type="button" onClick={() => onChange(shift(month, 1))} className={btn} aria-label="Next month">›</button>
    </span>
  )
}
