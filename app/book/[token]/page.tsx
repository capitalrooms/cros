'use client'

// The job, from the contractor's text or email link — no sign-in (25 Oct 2026 as "Book your visit"; 15 Nov 2026 the
// whole job, Harry: "so they can do everything they need via the link that comes in"). The same steps and the same
// look as the contractor app, and the buttons follow the clock, so a contractor who never opens the app — or skips a
// step — is never stuck:
//   not booked   → pick a day and time
//   booked, before the day / earlier that day → On my way · See details · Move · Can't make it
//   from 30 min before (or once on their way) → I'm here · I'm running late
//   past their time → "You're late" + the same; well past → Rebook first
//   arrived      → How did it go? (fixed / coming back) · Not there yet? (20 minutes)
// Ask the tenants a question at any point; their answer is texted back. /api/book/[token]. Tenants see first names only.
import { use, useEffect, useState } from 'react'
import { display } from '@/app/components/garden/kit'

interface BookView {
  contractor: string
  job: { title: string; address: string; house: string; where: string; description: string; access: string; reference: string }
  booking: { date: string; slot: string; label: string } | null
  earliest: string; note: string
  slots: { value: string; label: string }[]
  office: { email: string; phone: string }
  visit?: { arrivedAt: string | null; slot: string | null; priority: string | null; price: number | null }
}

const full = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const londonMin = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' })); return d.getHours() * 60 + d.getMinutes() }
const ukTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(/\s/g, '')

const HONEY = 'text-[#17332B] shadow-[0_3px_0_var(--cr-honey-edge)] [background:var(--cr-gold)]'
const btn = 'h-12 w-full rounded-full text-[15px] font-bold disabled:opacity-40 active:translate-y-px'
const OUTLINE = 'border-[1.5px] border-[#17332B] bg-white text-[#17332B]'
const input = 'w-full rounded-xl border-[1.5px] border-[#DCE5DD] bg-white px-3 py-3 text-[16px] text-[#14261F]'
const label = 'block text-[11px] font-bold uppercase tracking-[.14em] text-[#4E6158] mb-1'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="garden min-h-screen bg-[#EEF2EC]" style={{ paddingTop: 'max(calc(env(safe-area-inset-top) + 10px), 16px)' }}>
      <div className="mx-auto max-w-xl space-y-3 px-4 pb-14">
        <div className="flex items-center justify-end pb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 26, width: 'auto' }} />
        </div>
        {children}
      </div>
    </div>
  )
}
const Card = ({ children, ring }: { children: React.ReactNode; ring?: boolean }) =>
  <section className={`rounded-[22px] bg-white p-5 text-[#14261F] shadow-[0_2px_0_#DCE5DD] ${ring ? 'ring-2 ring-[color:var(--cr-gold)]' : ''}`}>{children}</section>

export default function JobLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [view, setView] = useState<BookView | null>(null)
  const [error, setError] = useState('')
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [mode, setMode] = useState<'' | 'move' | 'cancel' | 'late' | 'done' | 'ask' | 'here'>('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [keySafe, setKeySafe] = useState<string | null | undefined>(undefined)
  const [warn, setWarn] = useState<{ message: string; blocked: boolean } | null>(null)
  const [lateOther, setLateOther] = useState('')
  const [outcome, setOutcome] = useState<'fixed' | 'return' | ''>('')
  const [notes, setNotes] = useState('')
  const [price, setPrice] = useState('')
  const [question, setQuestion] = useState('')
  const [onWay, setOnWay] = useState(false)
  const [, setTick] = useState(0)
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(i) }, [])
  useEffect(() => { try { setOnWay(!!localStorage.getItem(`cros-onway-${token}`)) } catch { /* private mode */ } }, [token])

  const load = () => fetch(`/api/book/${encodeURIComponent(token)}`)
    .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link is not valid.'); return d as BookView })
    .then(d => { setView(d); setDate(d.booking?.date ?? ''); setSlot(d.booking?.slot ?? ''); if (d.visit?.price != null && !price) setPrice(String(d.visit.price)) })
    .catch(e => { if (!finished) setError(e.message) })
  useEffect(() => { load() }, [token])   // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: Record<string, unknown>) {
    setSaving(true); setFormError('')
    try {
      const r = await fetch(`/api/book/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || d.message || 'That didn’t go through — please try again.')
      return d
    } catch (e) { setFormError(e instanceof Error ? e.message : 'That didn’t go through.'); return null }
    finally { setSaving(false) }
  }
  const after = async (text: string) => { setDone(text); setMode(''); await load() }

  if (error) return <Shell><Card><p className="text-base font-bold">{error}</p></Card></Shell>
  if (!view) return <Shell><p className="text-center text-sm text-[#4E6158]">Loading the job…</p></Shell>
  if (finished) return <Shell><section className="rounded-[22px] bg-[#17332B] p-5 text-white"><p className="text-[22px] font-extrabold" style={display}>{done}</p><p className="mt-1 text-sm text-white/80">Thank you. The office and the tenants have been told.</p></section></Shell>

  const { job } = view
  const emergency = String(view.visit?.priority ?? '').toLowerCase() === 'emergency'
  const arrived = !!view.visit?.arrivedAt
  // where they are against their time
  const phase = (() => {
    if (!view.booking) return 'unbooked'
    if (arrived) return 'arrived'
    if (view.booking.date < todayIso()) return 'missed'
    if (view.booking.date > todayIso()) return 'later'
    const s = String(view.visit?.slot ?? view.booking.slot ?? '')
    const by = /^by (\d{2}):(\d{2})$/.exec(s), range = /^(\d{1,2})-(\d{1,2})$/.exec(s)
    const start = by ? Number(by[1]) * 60 + Number(by[2]) : range ? Number(range[1]) * 60 : null
    const end = by ? start! : range ? Number(range[2]) * 60 : null
    if (start == null || end == null) return onWay ? 'due' : 'before'
    const now = londonMin()
    if (now > end + 45) return 'very_late'
    if (now > end) return 'late'
    return onWay || now >= start - 30 ? 'due' : 'before'
  })()
  const recentArrival = arrived && Date.now() - new Date(view.visit!.arrivedAt!).getTime() < 20 * 60000

  async function here(ack = false) {
    const d = await post({ action: 'here', ack })
    if (!d) return
    if (d.state === 'warn') { setWarn({ message: d.message, blocked: false }); return }
    if (d.state === 'blocked') { setWarn({ message: d.message, blocked: true }); return }
    setWarn(null); setKeySafe(d.keySafe ?? null); setMode(''); await load()
  }
  async function late(minutes: number | null) {
    let eta: Date
    if (minutes != null) eta = new Date(Date.now() + minutes * 60000)
    else { if (!lateOther) return; const [h, m] = lateOther.split(':').map(Number); eta = new Date(); eta.setHours(h, m, 0, 0) }
    if (await post({ action: 'late', eta: eta.toISOString() })) after(`The tenants know you’ll be there by ${ukTime(eta)}.`)
  }

  return (
    <Shell>
      <section className={`rounded-[22px] p-5 text-white ${emergency ? 'bg-[#8E2318]' : 'bg-[#17332B]'}`}>
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/75">
          {phase === 'late' || phase === 'very_late' ? 'You’re late — the tenants are expecting you' : emergency ? 'Emergency job' : 'Your job'}{job.reference ? ` · ${job.reference}` : ''}
        </p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-[1.08] tracking-[-0.02em]" style={display}>{job.title}</h1>
        <p className="mt-1 text-sm text-white/85">{job.address}</p>
        {view.booking && <p className="mt-2 text-sm font-semibold">{arrived ? `Arrived ${ukTime(new Date(view.visit!.arrivedAt!))}` : view.booking.label}</p>}
        <a className="mt-3 inline-flex h-9 items-center rounded-full border border-white/30 px-3 text-sm font-bold" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer">Directions</a>
      </section>

      {done && <p className="rounded-[18px] bg-[#E3ECE5] p-4 text-sm font-semibold text-[#17332B]">{done}</p>}
      {keySafe !== undefined && (
        <Card ring>
          <p className={label}>You’re in</p>
          {keySafe ? <><p className="text-sm">Key safe code — it opens the front door only:</p><p className="mt-1 text-[40px] font-extrabold tracking-[0.2em]" style={display}>{keySafe}</p><p className="text-xs text-[#4E6158]">Scramble the dial and close the box when you leave.</p></>
            : <p className="text-sm">The tenants have been told you’re here. There’s no key safe on file — they or the office will let you in.</p>}
        </Card>
      )}

      {/* what to do now — follows the clock */}
      {!mode && !warn && (
        <Card>
          <div className="space-y-2">
            {phase === 'unbooked' && <button type="button" className={`${btn} ${HONEY}`} onClick={() => setMode('move')}>Book a day and time</button>}
            {phase === 'later' && <><p className="text-sm text-[#4E6158]">See you on {view.booking!.label}.</p><button type="button" className={`${btn} ${OUTLINE}`} onClick={() => setMode('move')}>Move to another day</button></>}
            {phase === 'before' && <button type="button" disabled={saving} className={`${btn} ${HONEY}`} onClick={async () => { if (await post({ action: 'on_my_way' })) { try { localStorage.setItem(`cros-onway-${token}`, '1') } catch { /* private */ } setOnWay(true); setDone('The tenants know you’re on your way. Tap “I’m here” when you arrive.') } }}>On my way</button>}
            {(phase === 'due' || phase === 'late') && <button type="button" className={`${btn} ${HONEY}`} onClick={() => setMode('here')}>I’m here</button>}
            {phase === 'very_late' && <><button type="button" className={`${btn} ${HONEY}`} onClick={() => setMode('move')}>Rebook the visit</button><button type="button" className={`${btn} ${OUTLINE}`} onClick={() => setMode('here')}>I’m here</button></>}
            {(phase === 'due' || phase === 'late' || phase === 'before') && <button type="button" className={`${btn} ${OUTLINE}`} onClick={() => setMode('late')}>I’m running late</button>}
            {phase === 'missed' && <><p className="text-sm text-[#4E6158]">This visit was booked for {view.booking!.label} and hasn’t been logged.</p><button type="button" className={`${btn} ${HONEY}`} onClick={() => { setOutcome(''); setMode('done') }}>I came — log it</button><button type="button" className={`${btn} ${OUTLINE}`} onClick={() => setMode('move')}>Rebook the visit</button></>}
            {phase === 'arrived' && <button type="button" className={`${btn} ${HONEY}`} onClick={() => { setOutcome(''); setMode('done') }}>How did it go?</button>}
            {phase === 'arrived' && recentArrival && <button type="button" disabled={saving} className="h-10 w-full text-sm font-semibold text-[#4E6158] underline" onClick={async () => { if (confirm('Take back “I’m here”? The tenants won’t be told you’re there.') && await post({ action: 'undo_here' })) { setKeySafe(undefined); after('Taken back — tap “I’m here” when you arrive.') } }}>Not there yet?</button>}
            {['before', 'due', 'late', 'very_late', 'later'].includes(phase) && <button type="button" className="h-10 w-full text-sm font-semibold text-[#8E2318]" onClick={() => setMode('cancel')}>I can’t make it</button>}
          </div>
        </Card>
      )}

      {mode === 'here' && !warn && (
        <Card ring>
          <p className="text-[17px] font-bold">Are you at {job.house || 'the property'} now?</p>
          <p className="mt-1 text-sm text-[#4E6158]">We’ll tell the tenants you’re here and show you how to get in.</p>
          <div className="mt-3 space-y-2">
            <button type="button" disabled={saving} className={`${btn} ${HONEY}`} onClick={() => here(false)}>{saving ? 'One moment…' : 'Yes, I’m here'}</button>
            <button type="button" className={`${btn} ${OUTLINE}`} onClick={() => setMode('')}>Not yet — I’m on my way</button>
          </div>
        </Card>
      )}
      {warn && (
        <Card ring>
          <p className={label} style={{ color: warn.blocked ? '#8E2318' : '#7A5410' }}>{warn.blocked ? 'Not yet' : 'Short notice'}</p>
          <p className="text-[15px]">{warn.message}</p>
          <div className="mt-3 space-y-2">
            {!warn.blocked && <button type="button" disabled={saving} className={`${btn} ${HONEY}`} onClick={() => here(true)}>I understand — I’m here</button>}
            <button type="button" className={`${btn} ${OUTLINE}`} onClick={() => { setWarn(null); setMode('') }}>Back</button>
          </div>
        </Card>
      )}

      {mode === 'late' && (
        <Card ring>
          <p className="text-[17px] font-bold">When will you be there?</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([[15, '15 min'], [30, '30 min'], [60, '1 hour']] as const).map(([m, l]) => <button key={l} type="button" disabled={saving} onClick={() => late(m)} className={`h-12 rounded-full text-sm font-bold ${OUTLINE}`}>{l}</button>)}
          </div>
          <div className="mt-2 flex gap-2">
            <input type="time" value={lateOther} onChange={e => setLateOther(e.target.value)} className={`${input} h-12 flex-1 rounded-full`} aria-label="Another time" />
            <button type="button" disabled={!lateOther || saving} onClick={() => late(null)} className={`h-12 rounded-full px-5 text-sm font-bold ${HONEY} disabled:opacity-40`}>Send</button>
          </div>
          <p className="mt-2 text-xs text-[#4E6158]">The tenants are told straight away.{emergency ? ' If you’re not there 45 minutes after this time and we haven’t heard, we’ll send someone else.' : ''}</p>
          <button type="button" className="mt-1 h-10 w-full text-sm font-semibold text-[#4E6158]" onClick={() => setMode('')}>Back</button>
        </Card>
      )}

      {mode === 'move' && (
        <form onSubmit={async e => { e.preventDefault(); const d = await post({ action: 'book', date, slot }); if (d) { try { localStorage.removeItem(`cros-onway-${token}`) } catch { /* private */ } setOnWay(false); after(`${view.booking ? 'Moved' : 'Booked'}: ${d.label}. The tenants have been told.`) } }}>
          <Card ring>
            <p className="text-[17px] font-bold">{view.booking ? 'Pick a new day' : 'Pick a day and time'}</p>
            <p className="mt-1 text-sm text-[#4E6158]">{view.note}</p>
            <label className={`${label} mt-3`}>Day</label>
            <input className={input} type="date" min={view.earliest} value={date} onChange={e => setDate(e.target.value)} required />
            {date && <p className="mt-1 text-xs text-[#4E6158]">{full(date)}</p>}
            <p className={`${label} mt-3`}>Time</p>
            <div className="grid gap-2">
              {view.slots.map(s => <button key={s.value} type="button" onClick={() => setSlot(s.value)} className={`h-11 rounded-full border-[1.5px] text-sm font-semibold ${slot === s.value ? 'border-[#17332B] bg-[#17332B] text-white' : 'border-[#DCE5DD] bg-white text-[#14261F]'}`}>{s.label}</button>)}
            </div>
            <p className="mt-2 text-xs text-[#4E6158]">The tenants are told the day and time, with your first name and mobile in case they need to arrange access.</p>
            {formError && <p className="mt-2 text-sm font-semibold text-[#8E2318]">{formError}</p>}
            <div className="mt-3 space-y-2">
              <button disabled={saving || !date || !slot} className={`${btn} ${HONEY}`}>{saving ? 'Booking…' : view.booking ? 'Move my visit' : 'Book my visit'}</button>
              <button type="button" className="h-10 w-full text-sm font-semibold text-[#4E6158]" onClick={() => setMode('')}>Back</button>
            </div>
          </Card>
        </form>
      )}

      {mode === 'cancel' && (
        <Card ring>
          <p className="text-[17px] font-bold">Can’t make it?</p>
          <p className="mt-1 text-sm text-[#4E6158]">We’ll tell the office and the tenants. You can book a new day with this link afterwards.</p>
          <textarea className={`${input} mt-3`} rows={3} placeholder="Why? (optional)" value={reason} onChange={e => setReason(e.target.value)} />
          {formError && <p className="mt-2 text-sm font-semibold text-[#8E2318]">{formError}</p>}
          <div className="mt-3 space-y-2">
            <button type="button" disabled={saving} className={`${btn} bg-[#8E2318] text-white`} onClick={async () => { if (await post({ action: 'cancel', reason })) after('Visit cancelled — the office and the tenants have been told.') }}>{saving ? 'Sending…' : 'Cancel the visit'}</button>
            <button type="button" className="h-10 w-full text-sm font-semibold text-[#4E6158]" onClick={() => setMode('')}>Keep it</button>
          </div>
        </Card>
      )}

      {mode === 'done' && (
        <Card ring>
          <p className="text-[17px] font-bold">How did it go?</p>
          <div className="mt-3 grid gap-2">
            {([['fixed', 'Fixed — all done'], ['return', 'I need to come back']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setOutcome(k)} className={`h-12 rounded-full border-[1.5px] text-[15px] font-semibold ${outcome === k ? 'border-[#17332B] bg-[#17332B] text-white' : 'border-[#DCE5DD] bg-white text-[#14261F]'}`}>{l}</button>)}
          </div>
          {outcome && <>
            <label className={`${label} mt-3`}>{outcome === 'fixed' ? 'What you did' : 'What’s left to do'}</label>
            <textarea className={input} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder={outcome === 'fixed' ? 'e.g. replaced the washer, tested, no leak' : 'e.g. needs a new valve — ordered'} />
            {outcome === 'return' && <div className="mt-2 grid grid-cols-2 gap-2">
              <div><label className={label}>Back on</label><input type="date" className={input} min={todayIso()} value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><label className={label}>Time</label><select className={input} value={slot} onChange={e => setSlot(e.target.value)}><option value="">Any time</option>{view.slots.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            </div>}
            <label className={`${label} mt-3`}>Your price for this job (£)</label>
            <input inputMode="decimal" className={input} value={price} onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Labour and parts" />
          </>}
          {formError && <p className="mt-2 text-sm font-semibold text-[#8E2318]">{formError}</p>}
          <div className="mt-3 space-y-2">
            <button type="button" disabled={saving || !outcome} className={`${btn} ${HONEY}`} onClick={async () => {
              const d = await post({ action: 'done', outcome, notes, price, returnDate: date || null, returnSlot: slot || null })
              if (!d) return
              if (outcome === 'fixed') { setDone('Marked as done.'); setFinished(true) } else after('Thanks — the tenants and the office know you’re coming back.')
            }}>{saving ? 'Sending…' : 'Send'}</button>
            <button type="button" className="h-10 w-full text-sm font-semibold text-[#4E6158]" onClick={() => setMode('')}>Back</button>
          </div>
        </Card>
      )}

      {mode === 'ask' ? (
        <Card ring>
          <p className="text-[17px] font-bold">Ask the tenants</p>
          <p className="mt-1 text-sm text-[#4E6158]">They get it on their phone. Their answer is texted straight back to you.</p>
          <textarea className={`${input} mt-3`} rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. Where is the stopcock? Will anyone be in at 3?" />
          {formError && <p className="mt-2 text-sm font-semibold text-[#8E2318]">{formError}</p>}
          <div className="mt-3 space-y-2">
            <button type="button" disabled={saving || !question.trim()} className={`${btn} bg-[#17332B] text-white`} onClick={async () => { if (await post({ action: 'ask', question })) { setQuestion(''); after('Sent — their answer will come to you by text.') } }}>{saving ? 'Sending…' : 'Send question'}</button>
            <button type="button" className="h-10 w-full text-sm font-semibold text-[#4E6158]" onClick={() => setMode('')}>Back</button>
          </div>
        </Card>
      ) : (
        <button type="button" className={`${btn} ${OUTLINE}`} onClick={() => setMode('ask')}>Ask the tenants a question</button>
      )}

      <Card>
        <p className={label}>Where</p><p className="text-[15px]">{job.where}</p>
        {job.description && <><p className={`${label} mt-3`}>What the tenant reported</p><p className="whitespace-pre-line text-[15px]">{job.description}</p></>}
        <p className={`${label} mt-3`}>Getting in</p><p className="text-[15px]">{job.access}</p>
      </Card>

      <p className="px-1 text-center text-sm text-[#4E6158]">Questions for the office? <a className="font-semibold underline" href={`mailto:${view.office.email}`}>{view.office.email}</a>{view.office.phone ? <> · <a className="font-semibold underline" href={`tel:${view.office.phone.replace(/\s+/g, '')}`}>{view.office.phone}</a></> : null}</p>
      <p className="px-1 text-center text-xs text-[#4E6158]">Keep this link — it’s your job page. On the Capital Rooms app? <a className="underline" href="/contractor">Open your jobs</a>.</p>
    </Shell>
  )
}
