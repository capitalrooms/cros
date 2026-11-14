'use client'
// The top of the contractor's home (14 Nov 2026, "Garden Ask" rendering "Contractor — Jobs"): the Ask bar, "your next
// job is at", the green card with the job, the room and where it is in the house, "I'm here" (the notice rules and the
// key safe — lib/access/arrival) and directions; this week and quotes tiles; the key safe note; what needs doing; and
// the next few visits. Its own component so its hooks sit apart from the page's.
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { AskBar, Greeting, Hero, HoneyButton, GhostButton, Tile, Banner, ListCard, Row, Ico, PATHS, display } from '@/app/components/garden/kit'
import { useArrival } from '@/app/components/garden/useArrival'
import { slotLabel } from '@/lib/booking'

type Job = { id: string; title?: string | null; category?: string | null; priority?: string | null; booked_date?: string | null; booked_slot?: string | null; arrived_at?: string | null; status?: string; room_id?: string | null; rooms?: { name?: string; location_in_house?: string | null } | null; properties?: { name?: string; address?: string; postcode?: string | null } | null }
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const what = (j: Job) => j.title || String(j.category ?? 'Job').replace(/-/g, ' ').replace(/^./, s => s.toUpperCase())
const dayName = (iso: string) => iso === todayIso() ? 'Today' : new Date(iso + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

export default function ContractorTop({ firstName, booked, weekCount, quotesWaiting, todo, poppingBy, asId }: {
  firstName: string; booked: Job[]; weekCount: number; quotesWaiting: number
  todo: { n: number; text: string; onClick: () => void }[]; poppingBy: ReactNode; asId?: string
}) {
  const router = useRouter()
  const { arrive, sheet } = useArrival()
  const sorted = booked.slice().sort((a, b) => `${a.booked_date}${a.booked_slot}`.localeCompare(`${b.booked_date}${b.booked_slot}`))
  const next = sorted.find(j => j.booked_date && j.booked_date >= todayIso())
  const later = sorted.filter(j => j.id !== next?.id && (j.booked_date ?? '') >= todayIso()).slice(0, 3)
  const jobHref = (j: Job) => `/contractor/job/${j.id}${asId ? `?as=${asId}` : ''}`
  const isToday = next?.booked_date === todayIso()
  const room = next?.rooms?.name ? `${next.rooms.name}${next.rooms.location_in_house ? ` (${next.rooms.location_in_house})` : ''}` : 'Shared areas'
  const maps = next?.properties ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([next.properties.address || next.properties.name, next.properties.postcode].filter(Boolean).join(', '))}` : null

  async function imHere(j: Job) {
    const r = await arrive('job', j.id)
    if (r) setTimeout(() => router.push(jobHref(j)), 50)
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-[max(calc(env(safe-area-inset-top)+12px),16px)]">
      <AskBar href="/contractor/ask" prompt={next ? `Is there parking at ${next.properties?.name?.split(',')[0] ?? 'the property'}?` : 'Ask about your jobs'} />
      <Greeting eyebrow={`Hi ${firstName} — ${next ? 'your next job is at' : 'nothing booked yet'}`} title={next ? (next.properties?.name?.split(',')[0] ?? 'Your next job') : 'All clear'} />

      {next ? (
        <Hero art="tool" height={196} eyebrow={`${dayName(next.booked_date!)}${slotLabel(next.booked_slot) ? ` · ${slotLabel(next.booked_slot)}` : ''}`} title={what(next)}
          sub={[next.priority ? `Priority ${String(next.priority).replace(/^p/i, '')}` : '', room].filter(Boolean).join(' · ')}>
          {isToday && !next.arrived_at ? <HoneyButton onClick={() => imHere(next)}>I’m here</HoneyButton> : <HoneyButton href={jobHref(next)}>{next.arrived_at ? 'Carry on' : 'Open the job'}</HoneyButton>}
          {maps && <GhostButton href={maps}>Directions</GhostButton>}
        </Hero>
      ) : (
        <Hero art="tool" eyebrow="Nothing booked" title="Jobs to book show below" sub="Book a visit and the tenants are told" height={176} />
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Tile tone="sage" label="This week" value={`${weekCount} job${weekCount === 1 ? '' : 's'} booked`} />
        <Tile tone="butter" label="Quotes asked for" value={quotesWaiting ? `${quotesWaiting} waiting on you` : 'None waiting'} href={quotesWaiting ? `/contractor?tab=quotes${asId ? `&as=${asId}` : ''}` : undefined} />
      </div>

      <Banner badge={<Ico d={PATHS.key} size={22} />}>The key safe code shows when you tap <strong>I’m here</strong> on the day — rooms need 24 hours’ notice unless the tenant says yes.</Banner>

      {todo.length > 0 && (
        <ListCard>
          {todo.map((t, i) => (
            <button key={t.text} type="button" onClick={t.onClick} className={`flex w-full items-center gap-3 py-3 text-left ${i < todo.length - 1 ? 'border-b border-[#E8EEE9]' : ''}`}>
              <span className="grid h-8 min-w-8 place-items-center rounded-full px-2 text-sm font-extrabold text-[#17332B]" style={{ ...display, background: 'var(--cr-gold)' }}>{t.n}</span>
              <span className="flex-1 text-[15px] font-bold text-[#14261F]">{t.text}</span>
              <span className="text-[#4E6158]" aria-hidden="true">›</span>
            </button>
          ))}
        </ListCard>
      )}

      {later.length > 0 && (
        <ListCard>
          {later.map((j, i) => {
            const d = new Date((j.booked_date ?? todayIso()) + 'T12:00')
            return <Row key={j.id} last={i === later.length - 1} href={jobHref(j)}
              icon={<span className="flex flex-col items-center leading-none"><span className="text-[10px] font-bold text-[#4E6158]">{d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</span><span className="text-lg font-extrabold" style={display}>{d.getDate()}</span></span>}
              title={what(j)} sub={`${j.properties?.name?.split(',')[0] ?? ''}${j.rooms?.name ? ` · ${j.rooms.name}${j.rooms.location_in_house ? ` (${j.rooms.location_in_house})` : ''}` : ''}${slotLabel(j.booked_slot) ? ` · ${slotLabel(j.booked_slot)}` : ''}`} />
          })}
        </ListCard>
      )}

      <div>{poppingBy}</div>
      {sheet}
    </div>
  )
}
