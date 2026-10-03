'use client'

// A contractor's emergency link (texted to them). No sign-in. First: can you attend, when, call-out fee.
// Once confirmed: the full address and access, then "on site", "running late", "can't make it", and how it went —
// fixed / made safe / not fixed, with the part needed, the cost of a proper fix and when they can come back.

import { use, useEffect, useState } from 'react'
import Logo from '@/components/Logo'

interface View {
  kind: string; title: string; details: string | null; area: string; address: string | null
  tenant: { name: string; phone: string | null } | null; keySafe: string | null
  stage: 'ask' | 'answered' | 'covered' | 'chosen' | 'closed'
  answer: 'yes' | 'no' | null; eta: string | null; fee: number | null; note: string | null
  report: { onSite: string | null; outcome: string | null; part: string | null; fixCost: number | null; returnDate: string | null; returnSlot: string | null; at: string | null }
  emStatus: string
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(/\s/g, '')
const when = (iso: string) => {
  const d = new Date(iso), today = new Date()
  const same = d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === today.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  return same ? time(iso) : `${time(iso)} ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`
}
const inMinutes = (m: number) => new Date(Date.now() + m * 60000).toISOString()
const tomorrowAt = (h: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d.toISOString() }
const localInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }

const btn = 'w-full rounded-xl py-3 text-base font-bold disabled:opacity-40'
const input = 'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900'
const label = 'block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100">
      <nav className="bg-neutral-900 text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-lg justify-center px-4 py-3"><Logo variant="emblem" height={28} invert priority /></div>
      </nav>
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">{children}</div>
    </div>
  )
}
const Card = ({ children, tone }: { children: React.ReactNode; tone?: 'red' | 'green' }) =>
  <section className={`rounded-2xl border p-4 ${tone === 'red' ? 'border-red-200 bg-red-50' : tone === 'green' ? 'border-green-200 bg-green-50' : 'border-neutral-200 bg-white'}`}>{children}</section>

export default function EmergencyLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [view, setView] = useState<View | null>(null)
  const [slots, setSlots] = useState<{ value: string; label: string }[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)

  // first answer
  const [eta, setEta] = useState<string | null>(null)
  const [customEta, setCustomEta] = useState('')
  const [fee, setFee] = useState('')
  const [note, setNote] = useState('')
  // after the visit
  const [mode, setMode] = useState<'' | 'late' | 'cant' | 'report'>('')
  const [outcome, setOutcome] = useState<'fixed' | 'made_safe' | 'not_fixed' | ''>('')
  const [part, setPart] = useState('')
  const [fixCost, setFixCost] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [returnSlot, setReturnSlot] = useState('')
  const [newEta, setNewEta] = useState('')

  async function load() {
    const r = await fetch(`/api/emergencies/respond?token=${encodeURIComponent(token)}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'This link isn’t working'); return }
    setView(d.view); setSlots(d.slots ?? [])
  }
  useEffect(() => { load() }, [token])   // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr('')
    const r = await fetch('/api/emergencies/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Could not send that — try again'); return false }
    if (d.view) setView(d.view); else await load()
    setChanging(false); setMode('')
    return true
  }

  if (err && !view) return <Shell><Card tone="red"><p className="text-sm text-red-800">{err}</p></Card></Shell>
  if (!view) return <Shell><p className="text-center text-sm text-neutral-500">Loading…</p></Shell>

  const head = (
    <Card tone={view.stage === 'chosen' ? 'green' : 'red'}>
      <p className="text-xs font-bold uppercase tracking-widest text-red-700">{view.stage === 'chosen' ? 'Confirmed — you’re booked' : 'Emergency call-out'}</p>
      <h1 className="mt-1 text-xl font-extrabold text-neutral-900">{view.kind}</h1>
      <p className="text-sm text-neutral-700">{view.address ?? `Near ${view.area}`}</p>
      {view.title && view.title !== view.kind && <p className="mt-2 text-sm text-neutral-700">“{view.title}”</p>}
    </Card>
  )

  // ── 1. can you attend? ──
  if (view.stage === 'ask' || (view.stage === 'answered' && changing)) {
    const chosenEta = eta === 'custom' ? (customEta ? new Date(customEta).toISOString() : null) : eta
    return (
      <Shell>
        {head}
        <Card>
          <p className="text-base font-bold text-neutral-900">Can you attend?</p>
          <p className="mt-1 text-sm text-neutral-600">Others have been asked too. We confirm the soonest in a few minutes — you’ll get a text either way, and the full address once you’re confirmed.</p>
          <p className={`${label} mt-4`}>When can you be there?</p>
          <div className="grid grid-cols-2 gap-2">
            {[['Within 30 min', inMinutes(30)], ['Within 1 hour', inMinutes(60)], ['Within 90 min', inMinutes(90)], ['Within 2 hours', inMinutes(120)], ['Tomorrow 8am', tomorrowAt(8)]].map(([l, v]) => (
              <button key={l} type="button" onClick={() => setEta(v)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${eta && eta !== 'custom' && Math.abs(new Date(eta).getTime() - new Date(v).getTime()) < 120000 ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-800'}`}>{l}</button>
            ))}
            <button type="button" onClick={() => setEta('custom')} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${eta === 'custom' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-800'}`}>Another time</button>
          </div>
          {eta === 'custom' && <input type="datetime-local" className={`${input} mt-2`} value={customEta} min={localInput(new Date().toISOString())} onChange={e => setCustomEta(e.target.value)} />}
          <label className={`${label} mt-4`}>Your call-out fee (£)</label>
          <input inputMode="decimal" className={input} value={fee} onChange={e => setFee(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 120" />
          <label className={`${label} mt-4`}>Anything we should know? (optional)</label>
          <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. coming from Stratford" />
          {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
          <button type="button" disabled={busy || !chosenEta} onClick={() => post({ answer: 'yes', etaAt: chosenEta, fee, note })} className={`${btn} mt-4 bg-neutral-900 text-white`}>{busy ? 'Sending…' : 'Yes, I can attend'}</button>
          <button type="button" disabled={busy} onClick={() => post({ answer: 'no', note })} className={`${btn} mt-2 border border-neutral-300 bg-white text-neutral-700`}>Sorry, I can’t</button>
        </Card>
      </Shell>
    )
  }

  // ── 2. answered, waiting ──
  if (view.stage === 'answered') return (
    <Shell>
      {head}
      <Card>
        {view.answer === 'yes'
          ? <><p className="text-base font-bold text-neutral-900">Thanks — you said you can be there by {when(view.eta!)}{view.fee != null ? ` (£${view.fee} call-out)` : ''}.</p><p className="mt-1 text-sm text-neutral-600">We’ll text you in a few minutes to confirm, or to say it’s covered. Please don’t set off until we confirm.</p></>
          : <p className="text-base font-bold text-neutral-900">Thanks for letting us know you can’t make this one.</p>}
        <button type="button" onClick={() => { setChanging(true); setEta(null) }} className="mt-3 text-sm font-semibold text-blue-700 underline">Change my answer</button>
      </Card>
    </Shell>
  )

  // ── 3. covered by someone else ──
  if (view.stage === 'covered') return (
    <Shell>{head}<Card><p className="text-base font-bold text-neutral-900">Thanks — this one is covered.</p><p className="mt-1 text-sm text-neutral-600">No need to attend. We appreciate you answering.</p></Card></Shell>
  )

  // ── 4. confirmed (and after) ──
  const r = view.report
  const reported = !!r.at && r.outcome && r.outcome !== 'running_late'
  return (
    <Shell>
      {head}
      <Card>
        <dl className="space-y-2 text-sm">
          <div><dt className={label}>Address</dt><dd className="text-base font-semibold text-neutral-900">{view.address}</dd>
            <a className="text-sm font-semibold text-blue-700 underline" href={`https://maps.google.com/?q=${encodeURIComponent(view.address ?? '')}`} target="_blank" rel="noreferrer">Open in Maps</a></div>
          {view.eta && <div><dt className={label}>Expected by</dt><dd className="font-semibold">{when(view.eta)}</dd></div>}
          {view.tenant && <div><dt className={label}>Tenant</dt><dd>{view.tenant.name}{view.tenant.phone && <> · <a className="font-semibold text-blue-700 underline" href={`tel:${view.tenant.phone}`}>{view.tenant.phone}</a></>}</dd></div>}
          {view.keySafe && <div><dt className={label}>Front door key safe</dt><dd className="font-mono text-base font-bold">{view.keySafe}</dd></div>}
          {view.details && <div><dt className={label}>What they told us</dt><dd className="whitespace-pre-wrap text-neutral-700">{view.details}</dd></div>}
        </dl>
      </Card>

      {view.stage === 'closed' || reported ? (
        <Card tone="green">
          <p className="text-base font-bold text-neutral-900">Thanks — we’ve got your update.</p>
          <p className="mt-1 text-sm text-neutral-700">
            {r.outcome === 'fixed' ? 'Marked as fixed.' : r.outcome === 'made_safe' ? 'Made safe for now.' : r.outcome === 'not_fixed' ? 'Not fixed yet.' : 'Closed.'}
            {r.part ? ` Part: ${r.part}.` : ''}{r.fixCost != null ? ` Proper fix £${r.fixCost}.` : ''}{r.returnDate ? ` Back ${new Date(`${r.returnDate}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${r.returnSlot ? ` ${slots.find(x => x.value === r.returnSlot)?.label ?? ''}` : ''}.` : ''}
          </p>
          <p className="mt-2 text-sm text-neutral-600">Add photos, the price and your invoice on the job in the CROS app as usual.</p>
        </Card>
      ) : (
        <Card>
          {!mode && (
            <div className="space-y-2">
              {!r.onSite && <button type="button" disabled={busy} onClick={() => post({ outcome: 'on_site' })} className={`${btn} bg-neutral-900 text-white`}>I’m here now</button>}
              <button type="button" onClick={() => { setMode('report'); setOutcome('') }} className={`${btn} ${r.onSite ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-900'}`}>How did it go?</button>
              {!r.onSite && <button type="button" onClick={() => setMode('late')} className={`${btn} border border-neutral-300 bg-white text-neutral-700`}>I’m running late</button>}
              {!r.onSite && <button type="button" onClick={() => setMode('cant')} className={`${btn} border border-red-200 bg-white text-red-700`}>I can’t make it after all</button>}
            </div>
          )}

          {mode === 'late' && (
            <div className="space-y-3">
              <p className="text-base font-bold">When will you be there now?</p>
              <input type="datetime-local" className={input} value={newEta} min={localInput(new Date().toISOString())} onChange={e => setNewEta(e.target.value)} />
              <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="Reason (optional)" />
              <button type="button" disabled={busy || !newEta} onClick={() => post({ outcome: 'running_late', newEta: new Date(newEta).toISOString(), note })} className={`${btn} bg-neutral-900 text-white`}>{busy ? 'Sending…' : 'Update the time'}</button>
              <button type="button" onClick={() => setMode('')} className="w-full text-sm text-neutral-500">Back</button>
            </div>
          )}

          {mode === 'cant' && (
            <div className="space-y-3">
              <p className="text-base font-bold">Can’t make it?</p>
              <p className="text-sm text-neutral-600">We’ll send someone else straight away.</p>
              <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="What happened? (optional)" />
              <button type="button" disabled={busy} onClick={() => post({ outcome: 'cant_attend', note })} className={`${btn} bg-red-700 text-white`}>{busy ? 'Sending…' : 'I can’t attend'}</button>
              <button type="button" onClick={() => setMode('')} className="w-full text-sm text-neutral-500">Back</button>
            </div>
          )}

          {mode === 'report' && (
            <div className="space-y-3">
              <p className="text-base font-bold">How did it go?</p>
              <div className="grid gap-2">
                {([['fixed', 'Fixed — all done'], ['made_safe', 'Made safe — needs a proper fix'], ['not_fixed', 'Not fixed yet']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setOutcome(k)} className={`rounded-xl border px-3 py-3 text-left text-base font-semibold ${outcome === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`}>{l}</button>
                ))}
              </div>
              {outcome && outcome !== 'fixed' && (
                <>
                  <div><label className={label}>Why / what’s left to do</label><input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. valve isolated, pipe needs replacing" /></div>
                  <div><label className={label}>Part needed (if any)</label><input className={input} value={part} onChange={e => setPart(e.target.value)} placeholder="e.g. 15mm compression valve" /></div>
                  <div><label className={label}>Cost for the proper fix (£)</label><input inputMode="decimal" className={input} value={fixCost} onChange={e => setFixCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Labour and parts" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={label}>Back on</label><input type="date" className={input} value={returnDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setReturnDate(e.target.value)} /></div>
                    <div><label className={label}>Time</label><select className={input} value={returnSlot} onChange={e => setReturnSlot(e.target.value)}><option value="">Any time</option>{slots.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                  </div>
                </>
              )}
              {outcome === 'fixed' && <div><label className={label}>Anything to note? (optional)</label><input className={input} value={note} onChange={e => setNote(e.target.value)} /></div>}
              {err && <p className="text-sm text-red-700">{err}</p>}
              <button type="button" disabled={busy || !outcome} onClick={() => post({ outcome, note, part, fixCost, returnDate, returnSlot })} className={`${btn} bg-neutral-900 text-white`}>{busy ? 'Sending…' : 'Send update'}</button>
              <button type="button" onClick={() => setMode('')} className="w-full text-sm text-neutral-500">Back</button>
            </div>
          )}
        </Card>
      )}
    </Shell>
  )
}
