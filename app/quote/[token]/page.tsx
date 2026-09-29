'use client'

// Public page for a contractor who isn't on the app: see the job, send a price (or ask to visit first).
import { use, useEffect, useState } from 'react'
import Logo from '@/components/Logo'

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
    <div className="min-h-screen bg-neutral-100">
      <nav className="bg-neutral-900 text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-2xl justify-center px-4 py-md" style={{ minHeight: 52 }}>
          <Logo variant="emblem" height={30} invert priority />
        </div>
      </nav>
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">{children}</div>
      <p className="py-8 text-center text-xs text-neutral-400">Capital Rooms Ltd · Member of The Property Ombudsman · ClientMoney Protect</p>
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{label}</h2>
      <div className="mt-2 text-[15px] leading-relaxed text-neutral-900">{children}</div>
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

  if (error) return <Shell><Block label="Quote request"><p>{error}</p>{!/reply/i.test(error) && <p className="mt-2 text-neutral-500">If Capital Rooms sent you this, reply to their email instead.</p>}</Block></Shell>
  if (!view) return <Shell><div className="h-40 rounded-2xl bg-white animate-pulse" /></Shell>

  const { job } = view
  const open = view.status === 'requested' || view.status === 'submitted'

  return (
    <Shell>
      <header className="px-1">
        <p className="text-sm text-neutral-500">Quote request · {job.reference}</p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight text-neutral-950 text-balance">{job.title}</h1>
        <p className="mt-1 text-[15px] text-neutral-600">{job.where}</p>
        <p className="mt-2 text-sm text-neutral-500">For {view.contractorName} · please price by <strong className="text-neutral-800">{job.priceBy}</strong></p>
      </header>

      {job.description && <Block label="What the tenant reported"><p className="whitespace-pre-line">{job.description}</p></Block>}
      {job.notes && <Block label="Notes"><p className="whitespace-pre-line">{job.notes}</p></Block>}
      {view.message && <Block label="From the office"><p className="whitespace-pre-line">{view.message}</p></Block>}
      <Block label="Access"><p>{job.access}</p></Block>

      {job.photos.length > 0 && (
        <section className="rounded-2xl bg-white p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">Photos ({job.photos.length})</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {job.photos.map(src => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}

      {!open ? (
        <Block label="Your quote">
          <p>{view.status === 'accepted' ? 'Your quote has been accepted — thank you. We will be in touch to book a date.' : 'This quote request is closed. Thank you for your time.'}</p>
        </Block>
      ) : sent ? (
        <section className="rounded-2xl bg-neutral-950 p-5 text-white">
          <p className="text-lg font-bold">Thanks — we have your {siteVisit ? 'visit request' : 'price'}</p>
          <p className="mt-1 text-sm text-white/70">We will be in touch. You can change it using this same link until we decide.</p>
        </section>
      ) : (
        <form onSubmit={submit} className="rounded-2xl bg-white p-5 space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{view.status === 'submitted' ? 'Update your quote' : 'Your quote'}</h2>
          <label className="block">
            <span className="text-sm font-semibold text-neutral-800">Price for the job (£, including parts and VAT if you charge it)</span>
            <div className="mt-1 flex items-center rounded-xl border border-neutral-300 bg-white px-3 focus-within:ring-2 focus-within:ring-neutral-900">
              <span className="text-neutral-500">£</span>
              <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="180.00"
                className="w-full bg-transparent px-2 py-3 text-[16px] text-neutral-950 outline-none" />
            </div>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-neutral-800">Notes <span className="font-normal text-neutral-500">(what's included, how long it takes)</span></span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[16px] text-neutral-950 outline-none focus:ring-2 focus:ring-neutral-900" />
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={siteVisit} onChange={e => { setSiteVisit(e.target.checked); if (e.target.checked && !visitDate) setVisitDate(tomorrow()) }} className="mt-1 h-5 w-5" />
            <span className="text-sm text-neutral-800"><strong>I need to see it before I can price it</strong><br /><span className="text-neutral-500">Leave the price blank if you can&apos;t give one yet.</span></span>
          </label>
          {siteVisit && (
            <label className="block">
              <span className="text-sm font-semibold text-neutral-800">A date you could visit</span>
              <input type="date" min={tomorrow()} value={visitDate} onChange={e => setVisitDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-[16px] text-neutral-950" />
            </label>
          )}
          {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          <button disabled={saving} className="w-full rounded-xl bg-neutral-950 py-3.5 text-[15px] font-bold text-white disabled:opacity-50">
            {saving ? 'Sending…' : siteVisit && !amount ? 'Ask to visit first' : 'Send my price'}
          </button>
        </form>
      )}

      <p className="px-1 text-sm text-neutral-500">Questions? Email <a className="underline" href={`mailto:${view.office.email}`}>{view.office.email}</a>{view.office.phone ? <> or call {view.office.phone}</> : null}. Please quote {job.reference}.</p>
    </Shell>
  )
}
