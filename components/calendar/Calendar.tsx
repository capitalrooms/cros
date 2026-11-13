'use client'
// The calendar parts every screen uses (12 Nov 2026 — one calendar look across CROS). Colours and time words: ./look.
//  • WeekNav   — ← [This week] 9 November – 15 November 2026 →
//  • DayHead   — MON / 9, today's date in a red circle
//  • TimeGrid  — days across, hours down: two tones, half-hour lines, "now" line, entries sized to their length,
//                side by side when they overlap; click an entry or an empty slot; drag to move (optional)
//  • WeekStrip — days across without hours (a week of viewings at a glance)
//  • DayList   — the same days as a list, day by day (phones, and under the grid)
//  • MonthGrid — a month, Monday first, each day drawn by the screen (bank days, a mini month)
import Link from 'next/link'
import { useEffect, useState, type ReactNode, type DragEvent } from 'react'
import { CAL, TONES, type Tone, hourCell, hourLabel, isWeekend, niceTime, todayYmd, ymd, weekLabel, mondayOf } from './look'

export interface CalEntry {
  key: string
  date: string                 // yyyy-mm-dd
  start: number | null         // minutes after midnight; null = any time
  end?: number | null
  title: string
  line2?: string               // e.g. the house
  line3?: string               // e.g. who
  tone: Tone
  href?: string                // go somewhere when clicked…
  onClick?: () => void         // …or do something
  draggable?: boolean
}

const open = (e: CalEntry) => e.onClick?.()

/* ── WeekNav ─────────────────────────────────────────────────────────────── */
export function WeekNav({ monday, onChange, days = 7, compact }: { monday: Date; onChange: (d: Date) => void; days?: number; compact?: boolean }) {
  const thisWeek = ymd(mondayOf(new Date())) === ymd(monday)
  const btn = `rounded-lg border border-neutral-300 bg-white ${compact ? 'px-sm py-xs text-xs' : 'px-md py-sm text-sm'} font-semibold text-neutral-900 hover:bg-neutral-50`
  const step = (n: number) => { const d = new Date(monday); d.setDate(d.getDate() + n * 7); onChange(d) }
  return (
    <div className="flex flex-wrap items-center gap-xs">
      <button type="button" onClick={() => step(-1)} aria-label="Previous week" className={btn}>←</button>
      {!thisWeek && <button type="button" onClick={() => onChange(mondayOf(new Date()))} className={btn}>This week</button>}
      <span className={`${compact ? 'text-xs' : 'min-w-[13rem] text-sm'} text-center font-semibold text-neutral-900`}>{weekLabel(monday, days)}</span>
      <button type="button" onClick={() => step(1)} aria-label="Next week" className={btn}>→</button>
    </div>
  )
}

/* ── DayHead ─────────────────────────────────────────────────────────────── */
export function DayHead({ date, compact }: { date: Date; compact?: boolean }) {
  const isToday = ymd(date) === todayYmd()
  return (
    <div className={`text-center ${compact ? 'py-xs' : 'py-sm'}`} style={{ background: isWeekend(date) ? CAL.off : CAL.head }}>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: isToday ? CAL.today : CAL.muted }}>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
      <div className={`mx-auto mt-0.5 flex items-center justify-center rounded-full font-semibold tabular-nums ${compact ? 'h-7 w-7 text-base' : 'h-8 w-8 text-lg'}`}
        style={isToday ? { background: CAL.today, color: '#fff' } : { color: CAL.ink }}>{date.getDate()}</div>
    </div>
  )
}

/** an entry block's colours */
const toneStyle = (t: Tone) => ({ background: TONES[t].tint, color: TONES[t].ink, borderLeft: `3px solid ${TONES[t].bar}` })

function EntryBox({ e, className, style, children, onDragStart }: { e: CalEntry; className: string; style?: React.CSSProperties; children: ReactNode; onDragStart?: (ev: DragEvent) => void }) {
  const cls = `${className} text-left transition hover:z-20 hover:shadow-md focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900`
  const st = { ...toneStyle(e.tone), ...style }
  const title = [e.title, e.line2, e.line3].filter(Boolean).join(' — ')
  if (e.href && !e.onClick) return <Link href={e.href} className={cls} style={st} title={title} draggable={e.draggable} onDragStart={onDragStart}>{children}</Link>
  return <button type="button" className={cls} style={st} title={title} draggable={e.draggable} onDragStart={onDragStart} onClick={ev => { ev.stopPropagation(); open(e) }}>{children}</button>
}

/* ── TimeGrid ────────────────────────────────────────────────────────────── */
export function TimeGrid({ days, entries, hourHeight = 52, minHour = 8, maxHour = 19, compact, onSlot, onMove }: {
  days: Date[]
  entries: CalEntry[]
  hourHeight?: number
  minHour?: number
  maxHour?: number
  compact?: boolean
  /** an empty half hour clicked: the day and the minutes */
  onSlot?: (date: string, minutes: number) => void
  /** an entry dropped somewhere else */
  onMove?: (key: string, date: string, minutes: number) => void
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t) }, [])
  const timed = entries.filter(e => e.start != null)
  const first = Math.min(minHour, ...timed.map(e => Math.floor(e.start! / 60)))
  const last = Math.max(maxHour, ...timed.map(e => Math.ceil((e.end ?? e.start! + 60) / 60)))
  const hours = Array.from({ length: Math.max(1, last - first) }, (_, i) => first + i)
  const today = todayYmd()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const cols = `${compact ? 44 : 56}px repeat(${days.length}, minmax(0, 1fr))`
  const untimed = entries.filter(e => e.start == null)
  const minutesAt = (ev: { clientY: number; currentTarget: EventTarget }) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    return first * 60 + Math.max(0, Math.floor(((ev.clientY - r.top) / hourHeight) * 2)) * 30
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: CAL.line }}>
      <div className="grid border-b" style={{ gridTemplateColumns: cols, borderColor: CAL.line }}>
        <div />
        {days.map(d => <div key={ymd(d)} className="border-l" style={{ borderColor: CAL.line }}><DayHead date={d} compact={compact} /></div>)}
      </div>
      {untimed.length > 0 && (
        <div className="grid border-b" style={{ gridTemplateColumns: cols, borderColor: CAL.line, background: CAL.off }}>
          <div className="px-xs py-xs text-right text-[10px] uppercase tracking-wide" style={{ color: CAL.muted }}>Any time</div>
          {days.map(d => (
            <div key={ymd(d)} className="space-y-0.5 border-l p-0.5" style={{ borderColor: CAL.line }}>
              {untimed.filter(e => e.date === ymd(d)).map(e => (
                <EntryBox key={e.key} e={e} className="block w-full truncate rounded px-xs py-0.5 text-[11px] font-semibold">{e.title}{e.line2 ? ` · ${e.line2}` : ''}</EntryBox>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="relative grid" style={{ gridTemplateColumns: cols }}>
        <div>
          {hours.map((h, i) => (
            <div key={h} style={{ height: hourHeight }} className="relative pr-xs text-right">
              {i > 0 && <span className="relative -top-2 bg-white px-0.5 text-[11px] tabular-nums" style={{ color: CAL.muted }}>{hourLabel(h)}</span>}
            </div>
          ))}
        </div>
        {days.map(d => {
          const s = ymd(d)
          const list = timed.filter(e => e.date === s).sort((a, b) => a.start! - b.start!)
          const lanes: number[] = []           // the end of the last entry in each lane
          const laneOf = new Map<string, number>()
          for (const e of list) {
            let i = lanes.findIndex(end => end <= e.start!)
            if (i < 0) { lanes.push(0); i = lanes.length - 1 }
            lanes[i] = e.end ?? e.start! + 30; laneOf.set(e.key, i)
          }
          const width = 100 / Math.max(1, lanes.length)
          return (
            <div key={s} className="relative border-l" style={{ borderColor: CAL.line }}
              onDragOver={onMove ? ev => ev.preventDefault() : undefined}
              onDrop={onMove ? ev => { ev.preventDefault(); const k = ev.dataTransfer.getData('text/cal-key'); if (k) onMove(k, s, minutesAt(ev)) } : undefined}>
              {hours.map((h, i) => (
                <div key={h} style={{ height: hourHeight, background: hourCell(d, h), borderTop: i ? `1px solid ${CAL.line}` : undefined }}
                  className={onSlot ? 'cursor-pointer hover:!bg-[#EEF2F7]' : ''}
                  title={onSlot ? `Book ${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} at ${hourLabel(h)}` : undefined}
                  onClick={onSlot ? ev => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); onSlot(s, h * 60 + (ev.clientY - r.top > r.height / 2 ? 30 : 0)) } : undefined} />
              ))}
              {s === today && nowMin >= first * 60 && nowMin <= last * 60 && (
                <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: ((nowMin - first * 60) / 60) * hourHeight }}>
                  <div className="relative h-[2px]" style={{ background: CAL.today }}><span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full" style={{ background: CAL.today }} /></div>
                </div>
              )}
              {list.map(e => {
                const top = ((e.start! - first * 60) / 60) * hourHeight
                const h = Math.max(compact ? 30 : 34, (((e.end ?? e.start! + 30) - e.start!) / 60) * hourHeight - 2)
                const lane = laneOf.get(e.key)!
                return (
                  <EntryBox key={e.key} e={e} className="absolute z-[1] overflow-hidden rounded-md px-xs py-0.5 text-[11px] leading-tight"
                    style={{ top: top + 1, height: h, left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)`, cursor: e.draggable ? 'grab' : 'pointer' }}
                    onDragStart={e.draggable ? ev => { ev.dataTransfer.setData('text/cal-key', e.key); ev.dataTransfer.effectAllowed = 'move' } : undefined}>
                    <span className="block font-semibold tabular-nums">{niceTime(e.start!)}</span>
                    <span className="block truncate font-semibold">{e.title}</span>
                    {h > 44 && e.line2 && <span className="block truncate opacity-80">{e.line2}</span>}
                    {h > 60 && e.line3 && <span className="block truncate opacity-70">{e.line3}</span>}
                  </EntryBox>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── WeekStrip ───────────────────────────────────────────────────────────── */
export function WeekStrip({ days, entries, empty = '', onDay }: { days: Date[]; entries: CalEntry[]; empty?: string; onDay?: (date: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: CAL.line }}>
      <div className="grid grid-cols-1 sm:grid-cols-7">
        {days.map((d, i) => {
          const s = ymd(d), list = entries.filter(e => e.date === s).sort((a, b) => (a.start ?? -1) - (b.start ?? -1))
          return (
            <div key={s} className={`min-h-[110px] ${i ? 'border-t sm:border-l sm:border-t-0' : ''} ${!list.length ? 'hidden sm:block' : ''}`} style={{ borderColor: CAL.line, background: isWeekend(d) ? CAL.off : CAL.white }}>
              <button type="button" onClick={onDay ? () => onDay(s) : undefined} className={`block w-full ${onDay ? 'hover:bg-[#EEF2F7]' : 'cursor-default'}`} tabIndex={onDay ? 0 : -1}><DayHead date={d} compact /></button>
              <div className="space-y-xs px-xs pb-sm">
                {list.map(e => (
                  <EntryBox key={e.key} e={e} className="block w-full rounded-md px-xs py-0.5 text-xs">
                    <span className="font-semibold tabular-nums">{e.start == null ? '—' : niceTime(e.start)}</span> {e.title}
                    {e.line2 && <span className="block truncate opacity-80">{e.line2}</span>}
                  </EntryBox>
                ))}
                {!list.length && empty && <p className="px-xs text-xs" style={{ color: CAL.muted }}>{empty}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── DayList ─────────────────────────────────────────────────────────────── */
export function DayList({ days, entries, title, empty = 'Nothing booked', action }: { days: Date[]; entries: CalEntry[]; title?: ReactNode; empty?: string; action?: (date: string) => ReactNode }) {
  const today = todayYmd()
  return (
    <section className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: CAL.line }}>
      {title && <header className="border-b px-md py-sm" style={{ borderColor: CAL.line }}><h2 className="text-base font-bold text-neutral-900">{title}</h2></header>}
      {days.map(d => {
        const s = ymd(d), list = entries.filter(e => e.date === s).sort((a, b) => (a.start ?? -1) - (b.start ?? -1))
        return (
          <div key={s} className="border-t first:border-t-0" style={{ borderColor: CAL.line, background: isWeekend(d) ? CAL.off : CAL.white }}>
            <div className="flex items-center justify-between px-md pb-xs pt-sm">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: s === today ? CAL.today : CAL.muted }}>{d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}{s === today ? ' · today' : ''}</p>
              {action?.(s)}
            </div>
            {list.length ? <div className="pb-xs">{list.map(e => <AgendaRow key={e.key} e={e} />)}</div>
              : <p className="px-md pb-sm text-sm" style={{ color: CAL.muted }}>{empty}</p>}
          </div>
        )
      })}
    </section>
  )
}

/** one line in a list: time, what, where, who — the whole line opens it */
export function AgendaRow({ e }: { e: CalEntry }) {
  const inner = (
    <>
      <span className="w-1 shrink-0 rounded-full" style={{ background: TONES[e.tone].bar }} />
      <span className="w-16 shrink-0 pt-px text-sm font-semibold tabular-nums text-neutral-900">{e.start == null ? '—' : niceTime(e.start)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-neutral-900">{e.title}{e.line2 ? <span className="font-normal text-neutral-600"> · {e.line2}</span> : null}</span>
        {e.line3 && <span className="block truncate text-xs text-neutral-500">{e.line3}</span>}
      </span>
      {(e.href || e.onClick) && <span className="self-center text-xs font-semibold text-neutral-400 group-hover:text-neutral-900">Open →</span>}
    </>
  )
  const cls = 'group flex w-full items-stretch gap-md px-md py-sm text-left transition hover:bg-black/[0.03]'
  if (e.href && !e.onClick) return <Link href={e.href} className={cls}>{inner}</Link>
  if (e.onClick) return <button type="button" onClick={() => open(e)} className={cls}>{inner}</button>
  return <div className={cls}>{inner}</div>
}

/* ── MonthGrid ───────────────────────────────────────────────────────────── */
/** A month, Monday first. renderDay draws inside each day (the date number is drawn for you unless you take it over). */
export function MonthGrid({ year, month, renderDay, onDay, compact, selected }: {
  year: number; month: number                       // month 0–11
  renderDay?: (date: string, d: Date) => ReactNode
  onDay?: (date: string) => void
  compact?: boolean
  selected?: string | null
}) {
  const first = new Date(year, month, 1, 12)
  const lead = (first.getDay() + 6) % 7
  const daysIn = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(year, month, i + 1, 12))]
  while (cells.length % 7) cells.push(null)
  const today = todayYmd()
  return (
    <div>
      <div className="grid grid-cols-7 text-center">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className={`pb-xs ${compact ? 'text-[9.5px]' : 'text-[11px]'} font-semibold uppercase tracking-wider`} style={{ color: CAL.muted }}>{compact ? d[0] : d}</div>)}
      </div>
      <div className={`grid grid-cols-7 ${compact ? 'gap-0.5' : 'gap-xs'}`}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const s = ymd(d), isToday = s === today
          const body = (
            <>
              <span className={`mx-auto flex items-center justify-center rounded-full tabular-nums ${compact ? 'h-6 w-6 text-[11px]' : 'h-7 w-7 text-sm'} font-semibold`}
                style={isToday ? { background: CAL.today, color: '#fff' } : { color: CAL.ink }}>{d.getDate()}</span>
              {renderDay?.(s, d)}
            </>
          )
          const cls = `block rounded-lg ${compact ? 'py-0.5' : 'p-xs'} text-center ${selected === s ? 'ring-2 ring-neutral-900' : ''}`
          const bg = { background: compact ? 'transparent' : isWeekend(d) ? CAL.off : CAL.white }
          return onDay
            ? <button key={s} type="button" onClick={() => onDay(s)} className={`${cls} hover:bg-[#EEF2F7]`} style={bg}>{body}</button>
            : <div key={s} className={cls} style={bg}>{body}</div>
        })}
      </div>
    </div>
  )
}

export { CAL, TONES } from './look'
export type { Tone } from './look'
