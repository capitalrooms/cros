'use client'

// Book your visit — for a contractor who isn't on the app (25 Oct 2026). They get this link by text or email from
// the office, pick a day and time slot, and the tenants and office are told. The same link moves or cancels it.
// Look: the shared public frame (components/public/PublicShell, design "C"), as the quote page.
import { use, useEffect, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'

interface BookView {
  contractor: string
  job: { title: string; address: string; house: string; where: string; description: string; access: string; reference: string }
  booking: { date: string; slot: string; label: string } | null
  earliest: string; note: string
  slots: { value: string; label: string }[]
  office: { email: string; phone: string }
}

const full = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell label="Book your visit">
      <div className="mx-auto max-w-3xl px-6 pb-16 pt-10 md:px-14 md:pt-14 space-y-10">{children}</div>
    </PublicShell>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pub-rise" style={{ borderTop: '1px solid #111' }}>
      <p className="pub-eyebrow m-0 pt-4">{label}</p>
      <div className="mt-2 text-[16px] leading-relaxed">{children}</div>
    </section>
  )
}

export default function BookVisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [view, setView] = useState<BookView | null>(null)
  const [error, setError] = useState('')
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [changing, setChanging] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const load = () => fetch(`/api/book/${encodeURIComponent(token)}`)
    .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link is not valid.'); return d as BookView })
    .then(d => { setView(d); setDate(d.booking?.date ?? ''); setSlot(d.booking?.slot ?? '') })
    .catch(e => setError(e.message))
  useEffect(() => { load() }, [token])   // eslint-disable-line react-hooks/exhaustive-deps

  async function send(body: Record<string, unknown>, doneText: (d: any) => string) {
    setSaving(true); setFormError('')
    try {
      const r = await fetch(`/api/book/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'That didn’t go through — please try again.')
      setDone(doneText(d)); setChanging(false); setCancelling(false)
      await load()
    } catch (e) { setFormError(e instanceof Error ? e.message : 'That didn’t go through.') }
    finally { setSaving(false) }
  }

  if (error) return <Shell><Block label="Book your visit"><p className="m-0">{error}</p></Block></Shell>
  if (!view) return <Shell><p className="pub-eyebrow">Loading the job…</p></Shell>

  const { job } = view
  const showForm = !view.booking || changing

  return (
    <Shell>
      <header className="pub-enter space-y-3">
        <p className="pub-eyebrow m-0">Book your visit{job.reference ? ` · ${job.reference}` : ''}</p>
        <h1 className="pub-serif m-0 text-[clamp(2.2rem,8vw,4rem)] leading-[1.04]" style={{ textWrap: 'balance' as any }}>{job.title}</h1>
        <p className="m-0 text-[16px] pub-muted">{job.address}</p>
        <p className="m-0 text-[15px]">For {view.contractor}</p>
      </header>

      {done && (
        <section className="pub-rise p-6 md:p-10" style={{ background: '#111', color: '#F3F0EA' }}>
          <p className="pub-serif m-0 text-[34px] leading-tight md:text-[44px]">{done}</p>
          <p className="m-0 mt-2 text-[16px]" style={{ color: '#D8D3C8' }}>Keep this link — you can use it to move or cancel the visit.</p>
        </section>
      )}

      <Block label="Where"><p className="m-0">{job.where}</p></Block>
      {job.description && <Block label="What the tenant reported"><p className="m-0 whitespace-pre-line">{job.description}</p></Block>}
      <Block label="Access"><p className="m-0">{job.access}</p></Block>

      {view.booking && !changing && !cancelling && (
        <Block label="Your visit">
          <p className="m-0 text-[20px] font-semibold">{view.booking.label}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="pub-btn" onClick={() => { setChanging(true); setDone(null) }}>Move to another day</button>
            <button type="button" className="pub-btn-ghost" onClick={() => { setCancelling(true); setDone(null) }}>I can’t make it</button>
          </div>
        </Block>
      )}

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); send({ action: 'book', date, slot }, d => `${view.booking ? 'Moved' : 'Booked'}: ${d.label}`) }} className="pub-rise space-y-6" style={{ borderTop: '1px solid #111' }}>
          <p className="pub-eyebrow m-0 pt-4">{view.booking ? 'Pick a new day' : 'Pick a day and time'}</p>
          <p className="m-0 text-[15px] pub-muted">{view.note}</p>
          <label className="pub-label">Day
            <input className="pub-input" type="date" min={view.earliest} value={date} onChange={e => setDate(e.target.value)} required />
          </label>
          {date && <p className="m-0 -mt-3 text-[14px] pub-muted">{full(date)}</p>}
          <div className="space-y-2">
            <p className="pub-label m-0">Time</p>
            {view.slots.map(s => (
              <button key={s.value} type="button" className="pub-choice" aria-pressed={slot === s.value} onClick={() => setSlot(s.value)}>
                <span className={`pub-dot ${slot === s.value ? 'on' : ''}`} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <p className="m-0 text-[14px] pub-muted">When you book, the tenants are told the day and time and given your mobile number, in case they need to arrange access.</p>
          {formError && <p className="pub-error">{formError}</p>}
          <div className="flex flex-wrap gap-3">
            <button disabled={saving || !date || !slot} className="pub-btn">{saving ? 'Booking…' : view.booking ? 'Move my visit' : 'Book my visit'}</button>
            {changing && <button type="button" className="pub-btn-ghost" onClick={() => setChanging(false)}>Keep {view.booking?.label}</button>}
          </div>
        </form>
      )}

      {cancelling && (
        <form onSubmit={e => { e.preventDefault(); send({ action: 'cancel', reason }, () => 'Visit cancelled') }} className="pub-rise space-y-6" style={{ borderTop: '1px solid #111' }}>
          <p className="pub-eyebrow m-0 pt-4">Can’t make it</p>
          <p className="m-0 text-[15px]">We’ll tell the office and the tenants. You can book a new day with this link afterwards.</p>
          <label className="pub-label">Why? (optional)
            <textarea className="pub-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
          </label>
          {formError && <p className="pub-error">{formError}</p>}
          <div className="flex flex-wrap gap-3">
            <button disabled={saving} className="pub-btn">{saving ? 'Sending…' : 'Cancel the visit'}</button>
            <button type="button" className="pub-btn-ghost" onClick={() => setCancelling(false)}>Keep it</button>
          </div>
        </form>
      )}

      <p className="m-0 text-[15px]">Questions? Email <a className="pub-link" href={`mailto:${view.office.email}`}>{view.office.email}</a>{view.office.phone ? <> or call <a className="pub-link" href={`tel:${view.office.phone.replace(/\s+/g, '')}`}>{view.office.phone}</a></> : null}.</p>
    </Shell>
  )
}
