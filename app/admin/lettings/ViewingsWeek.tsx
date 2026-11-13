'use client'
// The viewings diary on the office's Lettings screen (12 Nov 2026, Harry: "I can't see a diary … in my admin window in
// Lettings"). A week at a glance — each day's viewings with time, room, house and who's coming — with the weeks either
// side, a link to book one, and the full diary (viewings, repairs, cleans together). Read-only.
// Drawn by the one calendar used across CROS (components/calendar).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { WeekStrip, WeekNav, type CalEntry } from '@/components/calendar/Calendar'
import { mondayOf, weekDays, ymd, addDays, parseTime } from '@/components/calendar/look'

interface V { id: string; viewing_date: string; viewing_slot: string | null; visitor_name: string | null; viewing_status: string | null; property_id: string | null; properties: { name: string } | null; rooms: { name: string } | null }

export default function ViewingsWeek() {
  const [start, setStart] = useState(() => mondayOf(new Date()))
  const [rows, setRows] = useState<V[] | null>(null)
  useEffect(() => {
    setRows(null)
    createClient().from('viewings').select('id, viewing_date, viewing_slot, visitor_name, viewing_status, property_id, properties(name), rooms(name)')
      .gte('viewing_date', ymd(start)).lt('viewing_date', ymd(addDays(start, 7))).or('viewing_status.is.null,viewing_status.neq.cancelled')
      .order('viewing_date').order('viewing_slot')
      .then(({ data }) => setRows((data ?? []) as any))
  }, [start])

  const days = weekDays(start)
  const count = rows?.length ?? 0
  const entries: CalEntry[] = (rows ?? []).map(v => ({
    key: v.id, date: v.viewing_date, ...parseTime(v.viewing_slot, 15),
    title: v.visitor_name || 'Viewing', line2: [v.rooms?.name, String(v.properties?.name ?? '').split('\n')[0]].filter(Boolean).join(' · '),
    tone: v.viewing_status === 'confirmed' ? 'viewing' : 'pending',
    href: v.property_id ? `/admin/properties/${v.property_id}?tab=lettings` : '/admin/agency-diary',
  }))
  return (
    <section className="space-y-sm rounded-2xl bg-white p-md ring-1 ring-neutral-200">
      <header className="flex flex-wrap items-center justify-between gap-sm">
        <h2 className="text-base font-bold text-neutral-900">Viewings <span className="ml-xs text-sm font-semibold tabular-nums text-neutral-400">{rows ? count : ''}</span></h2>
        <div className="flex flex-wrap items-center gap-sm">
          <WeekNav monday={start} onChange={setStart} compact />
          <Link href="/admin/agency-diary/book-appointment" className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-semibold text-white">+ Book a viewing</Link>
          <Link href="/admin/agency-diary" className="text-xs font-semibold text-neutral-700 underline">Full diary</Link>
        </div>
      </header>
      <WeekStrip days={days} entries={entries} />
      {rows && !count && <p className="text-sm text-neutral-500">No viewings this week.</p>}
      <p className="text-xs text-neutral-500"><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: '#7A4FB8' }} /> confirmed · <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: '#C9A227' }} /> to confirm</p>
    </section>
  )
}
