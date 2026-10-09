'use client'

// Public page for a contractor who isn't on the app: see the job, send a price (or ask to visit first).
// Look: the shared public frame (components/public/PublicShell, design "C").
import { use, useEffect, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'

interface QuoteView {
  contractorName: string
  status: 'requested' | 'submitted' | 'accepted' | 'declined' | 'withdrawn'
  amount: number | null; notes: string | null; siteVisit: boolean; visitDate: string | null
  message: string | null
  job: { reference: string; title: string; category: string; priority: string; where: string; description: string; notes: string; access: string; photos: string[]; priceBy: string }
  office: { email: string; phone: string }
}

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell label="Quote request">
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

export default function QuoteReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [view, setView] = useState<QuoteView | null>(null)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [siteVisit, setSiteVisit] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    fetch(`/api/quote/${encodeURIComponent(token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link is not valid.'); return d })
      .then((d: QuoteView) => {
        setView(d)
        if (d.amount != null) setAmount(String(d.amount))
        setNotes(d.notes || ''); setSiteVisit(d.siteVisit); setVisitDate(d.visitDate || '')
      })
      .catch(e => setError(e.message))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      const r = await fetch(`/api/quote/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount.trim() === '' ? null : amount.replace(/[£,\s]/g, ''), notes, site_visit: siteVisit, visit_date: siteVisit ? visitDate : null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not send your price.')
      setSent(true)
      setView(v => v && { ...v, status: 'submitted' })
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Could not send your price.') }
    finally { setSaving(false) }
  }

  if (error) return <Shell><Block label="Quote request"><p className="m-0">{error}</p>{!/reply/i.test(error) && <p className="pub-muted m-0 mt-2">If Capital Rooms sent you this, reply to their email instead.</p>}</Block></Shell>
  if (!view) return <Shell><p className="pub-eyebrow">Loading the job…</p></Shell>

  const { job } = view
  const open = view.status === 'requested' || view.status === 'submitted'

  return (
    <Shell>
      <header className="pub-enter space-y-3">
        <p className="pub-eyebrow m-0">Quote request · {job.reference}</p>
        <h1 className="pub-serif m-0 text-[clamp(2.4rem,9vw,4.5rem)] leading-[1.02]" style={{ textWrap: 'balance' as any }}>{job.title}</h1>
        <p className="m-0 text-[16px] pub-muted">{job.where}</p>
        <p className="m-0 text-[15px]">For {view.contractorName} · please price by <strong>{job.priceBy}</strong></p>
      </header>

      {job.description && <Block label="What the tenant reported"><p className="m-0 whitespace-pre-line">{job.description}</p></Block>}
      {job.notes && <Block label="Notes"><p className="m-0 whitespace-pre-line">{job.notes}</p></Block>}
      {view.message && <Block label="From the office"><p className="m-0 whitespace-pre-line">{view.message}</p></Block>}
      <Block label="Access"><p className="m-0">{job.access}</p></Block>

      {job.photos.length > 0 && (
        <Block label={`Photos (${job.photos.length})`}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {job.photos.map(src => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden" style={{ background: '#EFEBE3' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="Photo of the job" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </Block>
      )}

      {!open ? (
        <Block label="Your quote">
          <p className="m-0">{view.status === 'accepted' ? 'Your quote has been accepted — thank you. We will be in touch to book a date.' : 'This quote request is closed. Thank you for your time.'}</p>
        </Block>
      ) : sent ? (
        <section className="pub-rise p-6 md:p-10" style={{ background: '#111', color: '#F3F0EA' }}>
          <p className="pub-serif m-0 text-[36px] leading-tight md:text-[48px]">Thank you.</p>
          <p className="m-0 mt-2 text-[16px]" style={{ color: '#D8D3C8' }}>We have your {siteVisit ? 'visit request' : 'price'} and will be in touch. You can change it using this same link until we decide.</p>
        </section>
      ) : (
        <form onSubmit={submit} className="pub-rise space-y-6" style={{ borderTop: '1px solid #111' }}>
          <p className="pub-eyebrow m-0 pt-4">{view.status === 'submitted' ? 'Update your quote' : 'Your quote'}</p>
          <label className="pub-label">Price for the job (£, including parts and VAT if you charge it)
            <input className="pub-input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="180.00" />
          </label>
          <label className="pub-label">Notes — what’s included, how long it takes
            <textarea className="pub-input" value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
          </label>
          <button type="button" className="pub-choice" onClick={() => { const v = !siteVisit; setSiteVisit(v); if (v && !visitDate) setVisitDate(tomorrow()) }} aria-pressed={siteVisit}>
            <span className={`pub-dot sq ${siteVisit ? 'on' : ''}`} />
            <span>I need to see it before I can price it<small>Leave the price blank if you can’t give one yet.</small></span>
          </button>
          {siteVisit && (
            <label className="pub-label">A date you could visit
              <input className="pub-input" type="date" min={tomorrow()} value={visitDate} onChange={e => setVisitDate(e.target.value)} />
            </label>
          )}
          {formError && <p className="pub-error">{formError}</p>}
          <button disabled={saving} className="pub-btn">{saving ? 'Sending…' : siteVisit && !amount ? 'Ask to visit first' : 'Send my price'}</button>
        </form>
      )}

      <p className="m-0 text-[15px]">Questions? Email <a className="pub-link" href={`mailto:${view.office.email}`}>{view.office.email}</a>{view.office.phone ? <> or call <a className="pub-link" href={`tel:${view.office.phone.replace(/\s+/g, '')}`}>{view.office.phone}</a></> : null}. Please quote {job.reference}.</p>
    </Shell>
  )
}
