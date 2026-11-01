'use client'

// The landlord reads their management agreement and presses "ready to sign" (1 Nov 2026) — the same step tenants
// have on their move-in pack. Look: the shared public frame (components/public/PublicShell, design "C").
import { use, useEffect, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'

interface View { title: string; clientName: string; properties: string[]; version: number; readyAt: string | null }

const wrap = 'mx-auto max-w-6xl px-6 md:px-14'

export default function AgreementReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState('')
  const [opened, setOpened] = useState(false)
  const [ticked, setTicked] = useState(false)
  const [name, setName] = useState('')
  const [questions, setQuestions] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/agreement/${encodeURIComponent(token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link isn’t valid.'); return d })
      .then(setView).catch(e => setError(e.message))
  }, [token])

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      const r = await fetch(`/api/agreement/${encodeURIComponent(token)}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, questions }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Something went wrong. Please reply to our email instead.')
      setDone(true)
    } catch (err) { setFormError((err as Error).message) } finally { setSaving(false) }
  }

  if (error) return <PublicShell label="Your agreement"><section className={`${wrap} py-24`}><p className="pub-error">{error}</p></section></PublicShell>
  if (!view) return <PublicShell label="Your agreement"><section className={`${wrap} py-24`}><p className="pub-eyebrow">Loading…</p></section></PublicShell>

  const ready = done || !!view.readyAt
  return (
    <PublicShell label="Your agreement">
      <section className={`${wrap} pt-12 md:pt-20`}>
        <p className="pub-eyebrow m-0">{view.clientName}</p>
        <h1 className="pub-h2 mt-2">Your {view.title.toLowerCase()}</h1>
        <p className="mt-3 max-w-2xl text-[16px]" style={{ color: '#4A4741' }}>{view.properties.join(' · ')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`/api/agreement/${token}?pdf=1`} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} className="pub-btn">Read the agreement</a>
          <a href={`/api/agreement/${token}?pdf=1&download=1`} onClick={() => setOpened(true)} className="pub-btn-ghost">Download</a>
        </div>
      </section>

      <section className={`${wrap} py-12 md:py-16`}>
        {ready ? (
          <div className="flex flex-col gap-3 p-6 md:p-10" style={{ background: '#111', color: '#F3F0EA' }}>
            <p className="pub-serif m-0 text-[40px] leading-tight md:text-[56px]">Thank you — we’ll send it to <span className="italic">sign.</span></p>
            <p className="m-0 text-[16px]" style={{ color: '#D8D3C8' }}>We’ve been told you’re happy with the agreement. It will arrive by email to sign online shortly.</p>
          </div>
        ) : (
          <form onSubmit={confirm} className="flex max-w-3xl flex-col gap-6">
            <h2 className="pub-h2">Ready to <span className="italic">sign?</span></h2>
            <label className="pub-label">Anything you’d like to ask or change first? (optional)
              <textarea className="pub-input" value={questions} onChange={e => setQuestions(e.target.value)} rows={3} />
            </label>
            <div style={{ borderTop: '1px solid #111' }}>
              <button type="button" className="pub-choice" onClick={() => setTicked(!ticked)} aria-pressed={ticked}>
                <span className={`pub-dot sq ${ticked ? 'on' : ''}`} />
                <span>I’ve read the agreement, including the fees, and I’m ready to sign.</span>
              </button>
            </div>
            <label className="pub-label">Your full name
              <input className="pub-input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            </label>
            {!opened && <p className="m-0 text-[14px]" style={{ color: '#8A857C' }}>Please open the agreement above before confirming.</p>}
            {formError && <p className="pub-error">{formError}</p>}
            <button disabled={saving || !ticked || !opened || name.trim().length < 2} className="pub-btn self-start">
              {saving ? 'Sending…' : 'I’ve read it and I’m ready to sign'}
            </button>
          </form>
        )}
      </section>
    </PublicShell>
  )
}
