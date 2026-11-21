'use client'
// The top of the contractor's home (14 Nov 2026, "Garden Ask" rendering "Contractor — Jobs"): the Ask bar, "your next
// job is at", the green card with the job, the room and where it is in the house, "I'm here" (the notice rules and the
// key safe — lib/access/arrival) and directions; this week and quotes tiles; the key safe note; what needs doing; and
// the next few visits. Its own component so its hooks sit apart from the page's.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminFetch } from '@/lib/adminFetch'
import type { ReactNode } from 'react'
import { AskBar, Greeting, Hero, HoneyButton, GhostButton, Tile, Banner, ListCard, Row, Ico, PATHS, display } from '@/app/components/garden/kit'
import { useArrival } from '@/app/components/garden/useArrival'
import StaffNotificationBell from '@/app/components/StaffNotificationBell'
import { slotLabel, slotStart } from '@/lib/booking'
import { inTenantRoom, jobWhere } from '@/lib/repairs/where'
import EnableNotifications from '@/app/components/EnableNotifications'

type Job = { id: string; title?: string | null; category?: string | null; priority?: string | null; booked_date?: string | null; booked_slot?: string | null; arrived_at?: string | null; status?: string; room_id?: string | null; rooms?: { name?: string; location_in_house?: string | null } | null; properties?: { name?: string; address?: string; postcode?: string | null } | null }
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const what = (j: Job) => j.title || String(j.category ?? 'Job').replace(/-/g, ' ').replace(/^./, s => s.toUpperCase())
const dayName = (iso: string) => iso === todayIso() ? 'Today' : new Date(iso + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

export default function ContractorTop({ firstName, booked, weekCount, quotesWaiting, todo, poppingBy, asId, fresh = [] }: {
  firstName: string; booked: Job[]; weekCount: number; quotesWaiting: number; fresh?: Job[]
  todo: { n: number; text: string; onClick: () => void }[]; poppingBy: ReactNode; asId?: string
}) {
  const router = useRouter()
  const { arrive, sheet } = useArrival()
  // emergencies they've been asked to attend and haven't answered (only while still open)
  const [emergencies, setEmergencies] = useState<{ token: string; label: string; area: string; closes: string | null }[]>([])
  useEffect(() => {
    const load = () => adminFetch('/api/contractor/emergencies').then(r => r.ok ? r.json() : null).then(d => d && setEmergencies(d.items ?? [])).catch(() => {})
    load(); const i = setInterval(load, 60000); return () => clearInterval(i)
  }, [])
  const sorted = booked.slice().sort((a, b) => `${a.booked_date}${a.booked_slot}`.localeCompare(`${b.booked_date}${b.booked_slot}`))
  const next = sorted.find(j => j.booked_date && j.booked_date >= todayIso())
  const later = sorted.filter(j => j.id !== next?.id && (j.booked_date ?? '') >= todayIso()).slice(0, 3)
  const jobHref = (j: Job) => `/contractor/job/${j.id}${asId ? `?as=${asId}` : ''}`
  const isToday = next?.booked_date === todayIso()
  const room = next && inTenantRoom({ location: (next as any).location }) && next.rooms?.name ? `${next.rooms.name}${next.rooms.location_in_house ? ` (${next.rooms.location_in_house})` : ''}` : (next as any)?.location ? `${jobWhere(next as any)} · shared area` : 'Shared areas'
  const maps = next?.properties ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([next.properties.address || next.properties.name, next.properties.postcode].filter(Boolean).join(', '))}` : null

  // "On my way": remembered on this phone for the job; the tenants are told (once, server side)
  const wayKey = (j: Job) => `cros-onway-${j.id}`
  const [onWay, setOnWay] = useState(false)
  const [wayBusy, setWayBusy] = useState(false)
  const [wayMsg, setWayMsg] = useState('')
  useEffect(() => { if (next) try { setOnWay(!!localStorage.getItem(wayKey(next))) } catch { /* private mode */ } }, [next?.id])   // eslint-disable-line react-hooks/exhaustive-deps
  async function onMyWay(j: Job) {
    setWayBusy(true)
    const r = await adminFetch('/api/arrive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'on_my_way', id: j.id }) }).catch(() => null)
    setWayBusy(false)
    if (!r?.ok) { const e = await r?.json().catch(() => ({})); alert((e as any)?.error || 'That didn’t send — try again.'); return }
    try { localStorage.setItem(wayKey(j), new Date().toISOString()) } catch { /* private mode */ }
    setOnWay(true); setWayMsg('The tenants know you’re on your way. Tap “I’m here” when you arrive.')
  }
  // where they are against their time: before / due (30 minutes before, or once on their way) / late (past the end of
  // their slot or time) / very late (45 minutes after that) / arrived. Re-worked every minute.
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => { const i = setInterval(() => setTickNow(Date.now()), 60000); return () => clearInterval(i) }, [])
  const londonMin = (() => { const d = new Date(new Date(tickNow).toLocaleString('en-US', { timeZone: 'Europe/London' })); return d.getHours() * 60 + d.getMinutes() })()
  const window_ = (j: Job) => {
    const slot = String(j.booked_slot ?? '')
    const st = slotStart(slot)
    if (!st) return null
    const [h, m] = st.split(':').map(Number)
    const end = /^\d{1,2}-(\d{1,2})$/.exec(slot)
    return { start: h * 60 + m, end: end ? Number(end[1]) * 60 : h * 60 + m }
  }
  const phaseOf = (j: Job | undefined): 'none' | 'later' | 'before' | 'due' | 'late' | 'very_late' | 'arrived' => {
    if (!j) return 'none'
    if (j.arrived_at) return 'arrived'
    if (j.booked_date !== todayIso()) return 'later'
    const w = window_(j)
    if (!w) return onWay ? 'due' : 'before'
    if (londonMin > w.end + 45) return 'very_late'
    if (londonMin > w.end) return 'late'
    return onWay || londonMin >= w.start - 30 ? 'due' : 'before'
  }
  const phase = phaseOf(next)

  // "I'm running late": pick how late — the tenants are told; on an emergency the clock moves to the new time
  const [lateOpen, setLateOpen] = useState(false)
  const [lateOther, setLateOther] = useState('')
  async function sendLate(minutes: number | null) {
    if (!next) return
    let eta: Date
    if (minutes != null) eta = new Date(Date.now() + minutes * 60000)
    else { if (!lateOther) return; const [h, m] = lateOther.split(':').map(Number); eta = new Date(); eta.setHours(h, m, 0, 0); if (eta.getTime() < Date.now()) { alert('Pick a time later today.'); return } }
    const r = await adminFetch('/api/arrive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'running_late', id: next.id, eta: eta.toISOString() }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { alert((j as any).error || 'That didn’t send — try again.'); return }
    setLateOpen(false); setLateOther('')
    setWayMsg(`The tenants have been told you’ll be there by ${eta.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(/\s/g, '')}.`)
  }

  // "I'm here" tapped by mistake — take it back (within 20 minutes)
  async function undoHere(j: Job) {
    if (!confirm('Take back “I’m here”? The tenants won’t be told you’ve arrived.')) return
    const r = await adminFetch('/api/arrive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'undo', kind: 'job', id: j.id }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { alert((d as any).error || 'Couldn’t take it back — call the office.'); return }
    window.location.reload()
  }

  async function imHere(j: Job) {
    await arrive('job', j.id, { onDone: () => { window.location.href = jobHref(j) } })
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-[max(calc(env(safe-area-inset-top)+12px),16px)]">
      <AskBar bell={<StaffNotificationBell tone="light" />} href="/contractor/ask" prompt={next ? `Is there parking at ${next.properties?.name?.split(',')[0] ?? 'the property'}?` : 'Ask about your jobs'} />
      {/* phone notifications first: an emergency has to reach them when they're not in the app (15 Nov 2026) */}
      <EnableNotifications />
      {emergencies.map(e => (
        <a key={e.token} href={`/e/${e.token}`} className="flex items-center gap-3 rounded-[22px] bg-[#8E2318] p-4 text-white">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#8E2318]"><Ico d={PATHS.alert} size={22} /><span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-[#8E2318] bg-[#F2B84B]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-widest text-white/80">Emergency · can you attend?</span>
            <span className="block truncate text-[15px] font-bold">{e.label} near {e.area}</span>
            {e.closes && <span className="block text-[13px] text-white/80">Answer by {new Date(e.closes).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} — say when you could get there</span>}
          </span>
          <span aria-hidden="true">›</span>
        </a>
      ))}

      {/* new jobs sent to them and not booked in yet: the alert (14 Nov 2026) */}
      {fresh.slice(0, 3).map(j => (
        <a key={j.id} href={jobHref(j)} className="flex items-center gap-3 rounded-[22px] bg-white p-4 ring-2 ring-[color:var(--cr-gold)]">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#17332B]" style={{ background: 'var(--cr-gold)' }}>
            <Ico d={PATHS.tool} size={20} />
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-white bg-[#C2410C]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-widest text-[#7A5410]">New job · book it in</span>
            <span className="block truncate text-[15px] font-bold text-[#14261F]">{what(j)}</span>
            <span className="block truncate text-[13px] text-[#4E6158]">{j.properties?.name?.split(',')[0]}{j.rooms?.name ? ` · ${j.rooms.name}${j.rooms.location_in_house ? ` (${j.rooms.location_in_house})` : ''}` : ''}</span>
          </span>
          <span className="text-[#4E6158]" aria-hidden="true">›</span>
        </a>
      ))}

      <Greeting eyebrow={`Hi ${firstName} — ${next ? 'your next job is at' : 'nothing booked yet'}`} title={next ? (next.properties?.name?.split(',')[0] ?? 'Your next job') : 'All clear'} />

      {next ? (
        <Hero art="tool" height={190} tone={String(next.priority).toLowerCase() === 'emergency' ? 'red' : undefined} eyebrow={`${phase === 'late' || phase === 'very_late' ? 'You’re late — the tenants are expecting you · ' : String(next.priority).toLowerCase() === 'emergency' ? 'EMERGENCY · ' : ''}${dayName(next.booked_date!)}${slotLabel(next.booked_slot) ? ` · ${slotLabel(next.booked_slot)}` : ''}`} title={what(next)}
          sub={[String(next.priority).toLowerCase() === 'emergency' ? 'Emergency' : next.priority ? `Priority ${String(next.priority).replace(/^p/i, '')}` : '', room].filter(Boolean).join(' · ')}>
          {/* buttons that follow the clock (15 Nov 2026, Harry: "idiot proof … adjusting with the time rather than sitting
              with old boxes"): before → On my way; due → I'm here + Running late; late → the same, said plainly; well
              past → Rebook first. Every step can be skipped; "I'm here" asks first and can be taken back. */}
          {(phase === 'arrived' || phase === 'later') && <HoneyButton reload href={jobHref(next)}>{phase === 'arrived' ? 'Open the job' : 'See job'}</HoneyButton>}
          {phase === 'before' && <HoneyButton disabled={wayBusy} onClick={() => onMyWay(next)}>{wayBusy ? 'Telling them…' : 'On my way'}</HoneyButton>}
          {(phase === 'due' || phase === 'late') && <HoneyButton onClick={() => imHere(next)}>I’m here</HoneyButton>}
          {phase === 'very_late' && <HoneyButton reload href={`${jobHref(next)}${jobHref(next).includes('?') ? '&' : '?'}rebook=1`}>Rebook the visit</HoneyButton>}
          {phase === 'very_late' && <GhostButton onClick={() => imHere(next)}>I’m here</GhostButton>}
          {(phase === 'due' || phase === 'late') && <GhostButton onClick={() => setLateOpen(true)}>I’m running late</GhostButton>}
          {phase === 'arrived' && next.arrived_at && tickNow - new Date(next.arrived_at).getTime() < 20 * 60000 && <GhostButton onClick={() => undoHere(next)}>Not there yet?</GhostButton>}
          {maps && <GhostButton href={maps}>Directions</GhostButton>}
          {phase !== 'arrived' && phase !== 'later' && <GhostButton href={jobHref(next)}>See job</GhostButton>}
          {wayMsg && <p className="w-full text-xs font-semibold text-[#F1F5EE]">{wayMsg}</p>}
        </Hero>
      ) : (
        <Hero art="tool" eyebrow="Nothing booked" title="Jobs to book show below" sub="Need to check something at a house first, like a tap size? Ask the office to book a visit." height={176}>
          <HoneyButton href={`/contractor/quote-request?kind=visit${asId ? `&as=${asId}` : ''}`}>Book a visit</HoneyButton>
        </Hero>
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
              title={what(j)} sub={`${j.properties?.name?.split(',')[0] ?? ''}${j.rooms?.name && inTenantRoom({ location: (j as any).location }) ? ` · ${j.rooms.name}${j.rooms.location_in_house ? ` (${j.rooms.location_in_house})` : ''}` : ''}${slotLabel(j.booked_slot) ? ` · ${slotLabel(j.booked_slot)}` : ''}`} />
          })}
        </ListCard>
      )}

      <div>{poppingBy}</div>
      {sheet}
      {lateOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" onMouseDown={e => { if (e.target === e.currentTarget) setLateOpen(false) }}>
          <div className="w-full max-w-md rounded-t-[28px] bg-[#EEF2EC] p-5 sm:rounded-[28px]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
            <p className="text-xs font-bold uppercase tracking-widest text-[#4E6158]">Running late</p>
            <p className="mt-2 text-[17px] font-bold text-[#14261F]">When will you be there?</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[[15, '15 min'], [30, '30 min'], [60, '1 hour']].map(([m, l]) => <button key={l} type="button" onClick={() => sendLate(m as number)} className="h-12 rounded-full border-[1.5px] border-[#17332B] bg-white text-sm font-bold text-[#17332B]">{l}</button>)}
            </div>
            <div className="mt-2 flex gap-2">
              <input type="time" value={lateOther} onChange={e => setLateOther(e.target.value)} className="h-12 flex-1 rounded-full border-[1.5px] border-[#DCE5DD] bg-white px-4 text-[16px] text-[#14261F]" aria-label="Another time" />
              <button type="button" disabled={!lateOther} onClick={() => sendLate(null)} className="h-12 rounded-full px-5 text-sm font-bold text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)] disabled:opacity-40" style={{ background: 'var(--cr-gold)' }}>Send</button>
            </div>
            <p className="mt-2 text-xs text-[#4E6158]">The tenants are told straight away. Can’t make it today? <a className="font-bold underline" href={`${jobHref(next!)}${jobHref(next!).includes('?') ? '&' : '?'}rebook=1`}>Rebook the visit</a>.</p>
            <button type="button" onClick={() => setLateOpen(false)} className="mt-2 h-10 w-full text-sm font-semibold text-[#4E6158]">Back</button>
          </div>
        </div>
      )}
    </div>
  )
}
