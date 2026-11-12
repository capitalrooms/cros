'use client'
// The viewings diary on the office's Lettings screen (12 Nov 2026, Harry: "I can't see a diary … in my admin window in
// Lettings"). A week at a glance — each day's viewings with time, room, house and who's coming — with the weeks either
// side, a link to book one, and the full diary (viewings, repairs, cleans together). Read-only.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface V { id: string; viewing_date: string; viewing_slot: string | null; visitor_name: string | null; viewing_status: string | null; property_id: string | null; properties: { name: string } | null; rooms: { name: string } | null }

const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const monday = (d: Date) => { const x = new Date(`${iso(d)}T12:00:00Z`); const wd = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - wd); return x }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

export default function ViewingsWeek() {
  const [start, setStart] = useState(() => monday(new Date()))
  const [rows, setRows] = useState<V[] | null>(null)
  useEffect(() => {
    setRows(null)
    createClient().from('viewings').select('id, viewing_date, viewing_slot, visitor_name, viewing_status, property_id, properties(name), rooms(name)')
      .gte('viewing_date', iso(start)).lt('viewing_date', iso(addDays(start, 7))).or('viewing_status.is.null,viewing_status.neq.cancelled')
      .order('viewing_date').order('viewing_slot')
      .then(({ data }) => setRows((data ?? []) as any))
  }, [start])

  const today = iso(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const label = `${days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })} – ${days[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`
  const count = rows?.length ?? 0
  return (
    <section className="rounded-2xl bg-white ring-1 ring-neutral-200">
      <header className="flex flex-wrap items-center justify-between gap-sm border-b border-neutral-100 px-lg py-md">
        <div>
          <h2 className="text-base font-bold text-neutral-900">Viewings <span className="ml-xs text-sm font-semibold tabular-nums text-neutral-400">{rows ? count : ''}</span></h2>
          <p className="text-xs text-neutral-500">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          <button type="button" onClick={() => setStart(addDays(start, -7))} className="rounded-full border border-neutral-300 px-sm py-0.5 text-sm" aria-label="Previous week">‹</button>
          <button type="button" onClick={() => setStart(monday(new Date()))} className="rounded-full border border-neutral-300 px-sm py-0.5 text-xs font-semibold">This week</button>
          <button type="button" onClick={() => setStart(addDays(start, 7))} className="rounded-full border border-neutral-300 px-sm py-0.5 text-sm" aria-label="Next week">›</button>
          <Link href="/admin/agency-diary/book-appointment" className="ml-xs rounded-full bg-neutral-900 px-md py-0.5 text-xs font-semibold text-white">+ Book a viewing</Link>
          <Link href="/admin/agency-diary" className="text-xs font-semibold text-blue-700 hover:underline">Full diary</Link>
        </div>
      </header>
      <div className="grid grid-cols-1 divide-y divide-neutral-100 sm:grid-cols-7 sm:divide-x sm:divide-y-0">
        {days.map(d => {
          const key = iso(d)
          const list = (rows ?? []).filter(v => v.viewing_date === key)
          return (
            <div key={key} className={`min-h-[96px] p-sm ${key === today ? 'bg-blue-50/60' : ''} ${!list.length ? 'hidden sm:block' : ''}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${key === today ? 'text-blue-700' : 'text-neutral-500'}`}>{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}</p>
              <ul className="mt-xs space-y-xs">
                {list.map(v => (
                  <li key={v.id}>
                    <Link href={v.property_id ? `/admin/properties/${v.property_id}?tab=lettings` : '/admin/agency-diary'} className={`block rounded-lg border-l-4 px-xs py-0.5 text-xs hover:shadow ${v.viewing_status === 'confirmed' ? 'border-emerald-500 bg-emerald-50' : 'border-amber-400 bg-amber-50'}`}>
                      <span className="font-semibold tabular-nums">{v.viewing_slot ? v.viewing_slot.slice(0, 5) : '—'}</span> {v.visitor_name || 'Viewing'}
                      <span className="block truncate text-neutral-600">{[v.rooms?.name, String(v.properties?.name ?? '').split('\n')[0]].filter(Boolean).join(' · ')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      {rows && !count && <p className="px-lg pb-md text-sm text-neutral-500">No viewings this week.</p>}
    </section>
  )
}
