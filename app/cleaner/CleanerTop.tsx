'use client'
// The top of the cleaner's Today screen (14 Nov 2026, "Garden Ask" rendering "Cleaner — Today"): the Ask bar, "3
// cleans", the green card with the day's route drawn stop by stop and "I'm here" for the next clean (which checks the
// notice the tenants had and shows the key safe — lib/access/arrival), the next stop and supplies tiles, a tenant's
// request with the room and where it is in the house, and what needs doing. Its own component so its data loads
// without upsetting the page's hooks.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminFetch } from '@/lib/adminFetch'
import { AskBar, Greeting, Hero, HoneyButton, Tile, Banner, ListCard, Row, display } from '@/app/components/garden/kit'
import { useArrival } from '@/app/components/garden/useArrival'
import StaffNotificationBell from '@/app/components/StaffNotificationBell'

type Clean = { id: string; property_id: string; clean_date: string; clean_time?: string | null; clean_type?: string | null; duration_hours?: number | null; arrived_at?: string | null; status?: string; properties?: { id?: string; name?: string } | null }
type Req = { cleanId: string; property: string; room: string | null; location: string | null; tasks: string[]; notes: string | null }
type Supply = { id: string; propertyId: string; property: string; item: string }
const ITEMS = ['Bin bags', 'Toilet roll', 'Washing-up liquid', 'Cleaning spray', 'Hand soap', 'Mop heads']
const time = (t?: string | null) => t ? String(t).slice(0, 5) : ''
const hours = (h?: number | null) => h ? `about ${h === 1 ? 'an hour' : h % 1 ? `${Math.floor(h)}½ hours` : `${h} hours`}` : ''

export default function CleanerTop({ firstName, today, doneToday, todo, onBook, onLogPast, properties, upcoming = [] }: {
  firstName: string; today: Clean[]; doneToday: Clean[]; upcoming?: Clean[]
  todo: { n: number; text: string; onClick: () => void }[]
  onBook: () => void; onLogPast: () => void
  properties: { id: string; name: string }[]
}) {
  const router = useRouter()
  const { arrive, sheet } = useArrival()
  const [reqs, setReqs] = useState<Req[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [supOpen, setSupOpen] = useState(false)
  const [supProp, setSupProp] = useState('')
  const [supItem, setSupItem] = useState('')

  const route = [...doneToday, ...today].sort((a, b) => time(a.clean_time).localeCompare(time(b.clean_time)))
  const next = today.slice().sort((a, b) => time(a.clean_time).localeCompare(time(b.clean_time)))[0]
  const after = today.filter(c => c.id !== next?.id).sort((a, b) => time(a.clean_time).localeCompare(time(b.clean_time)))[0]
  const houseIds = [...new Set([...route.map(c => c.property_id), ...properties.slice(0, 20).map(p => p.id)])].filter(Boolean)

  const load = () => adminFetch(`/api/cleaner/day?cleanIds=${route.map(c => c.id).join(',')}&propertyIds=${houseIds.join(',')}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setReqs(d.requests ?? []); setSupplies(d.supplies ?? []) } }).catch(() => {})
  useEffect(() => { load() }, [route.map(c => c.id).join(','), houseIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function imHere(c: Clean) {
    await arrive('clean', c.id, { onDone: () => router.push(`/cleaner/clean/${c.id}`) })
  }
  async function addSupply() {
    if (!supProp || !supItem.trim()) return
    const r = await adminFetch('/api/cleaner/day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: supProp, item: supItem.trim() }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert(j.error || 'Didn’t save'); return }
    setSupItem(''); load()
  }
  async function restock(id: string) {
    await adminFetch('/api/cleaner/day', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null)
    setSupplies(v => v.filter(x => x.id !== id))
  }

  const routeSupplies = supplies.filter(s => route.some(c => c.property_id === s.propertyId))
  const supplyTile = routeSupplies[0] ? `${routeSupplies[0].item} at ${routeSupplies[0].property.split(',')[0]}` : supplies[0] ? `${supplies[0].item} at ${supplies[0].property.split(',')[0]}` : 'All stocked up'
  const req = reqs.find(r => today.some(c => c.id === r.cleanId)) ?? reqs[0]
  const total = route.length

  return (
    <div className="flex flex-col gap-4 px-4 pt-[max(calc(env(safe-area-inset-top)+12px),16px)]">
      <AskBar bell={<StaffNotificationBell tone="light" />} href="/cleaner/ask" prompt={next ? `Any notes for ${next.properties?.name?.split(',')[0] ?? 'my next house'}?` : 'Ask about a house'} />
      <Greeting eyebrow={`${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'} ${firstName} — ${total ? 'today you have' : 'nothing booked today'}`}
        title={total ? `${total} clean${total === 1 ? '' : 's'}` : 'A free day'} />

      {next ? (
        <Hero art={{ route: route.length, at: route.findIndex(c => c.id === next.id) }} height={184}
          eyebrow={`${route.indexOf(next) === 0 ? 'First stop' : 'Next stop'}${time(next.clean_time) ? ` · ${time(next.clean_time)}` : ''}`}
          title={next.properties?.name?.split(',')[0] ?? 'Clean'}
          sub={[String(next.clean_type ?? '').replace(/_/g, ' ').replace(/^./, s => s.toUpperCase()) || 'Regular clean', hours(next.duration_hours)].filter(Boolean).join(' · ')}>
          {next.arrived_at
            ? <HoneyButton href={`/cleaner/clean/${next.id}`}>Carry on</HoneyButton>
            : <HoneyButton onClick={() => imHere(next)}>I’m here</HoneyButton>}
        </Hero>
      ) : (
        <Hero art="door" eyebrow="Nothing booked for today" title="Book a clean" sub="At one of your houses — the tenants are told you’re coming" height={176}>
          <HoneyButton onClick={onBook}>Book a clean</HoneyButton>
        </Hero>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Tile tone="sage" label="Next up" value={after ? `${time(after.clean_time) ? `${time(after.clean_time)} · ` : ''}${after.properties?.name?.split(',')[0] ?? 'Clean'}` : upcoming[0] ? `${new Date(upcoming[0].clean_date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${upcoming[0].properties?.name?.split(',')[0] ?? 'Clean'}` : next ? 'Last one today' : 'Nothing booked'} href={after ? `/cleaner/clean/${after.id}` : upcoming[0] ? `/cleaner/clean/${upcoming[0].id}` : undefined} />
        <Tile tone="butter" label={`Supplies${supplies.length ? ` · ${supplies.length} low` : ''}`} value={supplyTile} onClick={() => { setSupOpen(true); setSupProp(next?.property_id ?? properties[0]?.id ?? '') }} />
      </div>

      {req && (
        <Banner badge={req.room ? req.room.replace(/^room\s*/i, 'R') : '★'} href={`/cleaner/clean/${req.cleanId}`}>
          {req.property.split(',')[0]}{req.room ? `, ${req.room}` : ''}{req.location ? ` (${req.location})` : ''} asked: <strong>{req.tasks.slice(0, 2).join(', ') || req.notes}</strong>
        </Banner>
      )}

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

      {route.length > 1 && (
        <ListCard>
          {route.map((c, i) => (
            <Row key={c.id} last={i === route.length - 1} href={`/cleaner/clean/${c.id}`}
              icon={<span className="text-[13px] font-extrabold" style={display}>{c.status === 'completed' ? '✓' : i + 1}</span>}
              title={c.properties?.name?.split(',')[0] ?? 'Clean'} sub={[time(c.clean_time), hours(c.duration_hours)].filter(Boolean).join(' · ')}
              right={<span className="text-xs font-bold text-[#4E6158]">{c.status === 'completed' ? 'Done' : c.arrived_at ? 'On site' : c.id === next?.id ? 'Next' : ''}</span>} />
          ))}
        </ListCard>
      )}

      {/* on a free day the green card already says "Book a clean" */}
      <div className={`grid gap-2.5 ${next ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {next && <button type="button" onClick={onBook} className="h-12 rounded-full text-sm font-bold text-[#F1F5EE]" style={{ background: '#17332B' }}>Book a clean</button>}
        <button type="button" onClick={onLogPast} className="h-12 rounded-full border-[1.5px] border-[#17332B] bg-white text-sm font-bold text-[#17332B]">Log a past clean</button>
      </div>

      {supOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={e => { if (e.target === e.currentTarget) setSupOpen(false) }}>
          <div className="w-full max-w-md rounded-t-[28px] bg-[#EEF2EC] p-5 sm:rounded-[28px]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
            <p className="text-lg font-bold text-[#14261F]" style={display}>Supplies</p>
            <p className="text-sm text-[#4E6158]">Tap what’s running low — the office is told and restocks it.</p>
            {supplies.length > 0 && <div className="mt-3 rounded-2xl bg-white px-3 py-1">{supplies.map((x, i) => (
              <div key={x.id} className={`flex items-center gap-2 py-2.5 ${i < supplies.length - 1 ? 'border-b border-[#E8EEE9]' : ''}`}>
                <span className="min-w-0 flex-1 text-sm"><strong>{x.item}</strong> <span className="text-[#4E6158]">· {x.property.split(',')[0]}</span></span>
                <button type="button" onClick={() => restock(x.id)} className="rounded-full border border-[#17332B] px-3 py-1 text-xs font-bold text-[#17332B]">Restocked</button>
              </div>
            ))}</div>}
            <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-[#4E6158]">Which house
              <select value={supProp} onChange={e => setSupProp(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-[#DCE5DD] bg-white px-3 text-[15px] normal-case tracking-normal text-[#14261F]">
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            <div className="mt-3 flex flex-wrap gap-1.5">{ITEMS.map(i => <button key={i} type="button" onClick={() => setSupItem(i)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${supItem === i ? 'bg-[#17332B] text-white' : 'bg-white text-[#14261F] ring-1 ring-[#DCE5DD]'}`}>{i}</button>)}</div>
            <input value={supItem} onChange={e => setSupItem(e.target.value)} placeholder="Or type it" className="mt-2 h-11 w-full rounded-xl border border-[#DCE5DD] bg-white px-3 text-[15px]" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setSupOpen(false)} className="h-12 flex-1 rounded-full text-sm font-semibold text-[#4E6158]">Close</button>
              <button type="button" disabled={!supProp || !supItem.trim()} onClick={addSupply} className="h-12 flex-[2] rounded-full text-[15px] font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)] disabled:opacity-40" style={{ background: 'var(--cr-gold)' }}>Running low</button>
            </div>
          </div>
        </div>
      )}
      {sheet}
    </div>
  )
}
