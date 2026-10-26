'use client'

// The landlord's private page for one update about their incoming tenant (migration 228): the details we sent, the
// tenant's documents to open in a quick viewer (or all of them as one PDF report), and — on an offer sent for review —
// "Happy to go ahead" / "Not this one".
// The link stops working after 7 days. Look: the shared public frame (components/public/PublicShell, design "C").
import PdfView from '@/components/PdfView'
import { use, useEffect, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'

interface View {
  stage: string; title: string; subject: string | null; facts: { label: string; value: string }[]
  docs: { id: string; label: string; fileName: string; kind: 'pdf' | 'image' | 'other' }[]
  expires: string | null; answer: string | null; answerNote: string | null; answeredAt: string | null
}
const wrap = 'mx-auto max-w-6xl px-6 md:px-14'
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }) : ''

export default function LandlordUpdatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [v, setV] = useState<View | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [answerError, setAnswerError] = useState('')
  const [viewing, setViewing] = useState<number | null>(null)   // the document open in the quick viewer

  // ← → between documents, Esc to close
  useEffect(() => {
    if (viewing == null || !v) return
    const n = v.docs.length
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewing(null)
      if (e.key === 'ArrowRight') setViewing(i => i == null ? i : (i + 1) % n)
      if (e.key === 'ArrowLeft') setViewing(i => i == null ? i : (i - 1 + n) % n)
    }
    window.addEventListener('keydown', on)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', on); document.body.style.overflow = '' }
  }, [viewing, v])

  useEffect(() => {
    fetch(`/api/lu/${token}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error ?? 'This link isn’t working.'); else setV(d)
    }).catch(() => setError('This page couldn’t load. Please try again.'))
  }, [token])

  async function answer(a: 'approved' | 'declined') {
    setSending(a); setAnswerError('')
    const r = await fetch(`/api/lu/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: a, note }) })
    const d = await r.json().catch(() => ({}))
    setSending(null)
    if (!r.ok) { setAnswerError(d.error ?? 'That didn’t go through. Please reply to our email instead.'); return }
    setV(x => x ? { ...x, answer: a, answerNote: note || null, answeredAt: new Date().toISOString() } : x)
  }

  if (error) return (
    <PublicShell label="For the landlord">
      <section className={`${wrap} py-16`}>
        <h1 className="pub-serif m-0 text-[44px] leading-tight">{error}</h1>
        <p className="m-0 mt-4 text-[15px]" style={{ color: '#4A4741' }}>Email <a className="pub-link" href="mailto:management@capitalrooms.co.uk">management@capitalrooms.co.uk</a> or call 0207 112 9163.</p>
      </section>
    </PublicShell>
  )
  if (!v) return <PublicShell label="For the landlord"><section className={`${wrap} py-16`}><p className="pub-eyebrow m-0">Loading…</p></section></PublicShell>

  const name = v.facts.find(f => (f.label === 'Full name' || f.label === 'Name'))?.value
  const place = (v.subject ?? '').split(' — ').slice(1).join(' — ')
  return (
    <PublicShell label="For the landlord">
      <section className={`${wrap} pt-10 md:pt-14`}>
        <p className="pub-eyebrow m-0">{v.title}{place ? ` · ${place}` : ''}</p>
        <h1 className="pub-serif pub-display pub-enter m-0 mt-3" style={{ fontSize: 'clamp(2.75rem, 11vw, 6.5rem)' }}>
          <span className="block">{v.stage === 'offer' ? 'An offer' : 'Your new'}</span>
          <span className="block italic">{v.stage === 'offer' ? 'for your review.' : 'tenant.'}</span>
        </h1>
      </section>

      <section className={`${wrap} grid gap-10 pt-10 md:grid-cols-2 md:gap-16`}>
        <div style={{ borderTop: '1px solid #111' }}>
          {v.facts.map(f => (
            <div key={f.label} className="py-4" style={{ borderBottom: '1px solid #E4E0D8' }}>
              <p className="pub-eyebrow m-0">{f.label}</p>
              <p className="m-0 mt-1 whitespace-pre-line text-[17px] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{f.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-8">
          {v.docs.length > 0 && (
            <div>
              <h2 className="pub-serif m-0 text-[34px] leading-tight">Documents</h2>
              <p className="m-0 mt-2 text-[14px]" style={{ color: '#6F6B64' }}>Tap one to look through them, or download them all. This page works until {day(v.expires)}.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href={`/api/lu/${token}/report`} className="pub-btn no-underline" style={{ color: '#fff' }}>Download full report (PDF)</a>
                <a href={`/api/lu/${token}/zip`} className="pub-btn-ghost no-underline" style={{ minHeight: 54, color: '#111' }}>All files (zip)</a>
              </div>
              <p className="m-0 mt-2 text-[13px]" style={{ color: '#6F6B64' }}>The report is one PDF with a summary page first; the zip has each document as its own file.</p>
              <div className="mt-6" style={{ borderTop: '1px solid #111' }}>
                {v.docs.map((d, i) => (
                  <button key={d.id} type="button" onClick={() => setViewing(i)}
                    className="flex w-full items-center justify-between gap-4 border-0 bg-transparent py-4 text-left" style={{ borderBottom: '1px solid #E4E0D8', color: '#111', font: 'inherit', cursor: 'pointer' }}>
                    <span className="min-w-0"><span className="block text-[16px] font-medium">{d.label}</span><span className="block truncate text-[13px]" style={{ color: '#6F6B64' }}>{d.fileName}</span></span>
                    <span className="pub-btn-ghost shrink-0">View</span>
                  </button>
                ))}
              </div>
              <p className="m-0 mt-4 text-[13px] leading-relaxed" style={{ color: '#4A4741', borderLeft: '1px solid #111', paddingLeft: 14 }}>
                These are personal documents. Please keep them safely and only for managing the tenancy, as data-protection law requires.
              </p>
            </div>
          )}

          {v.stage === 'offer' && (
            <div className="p-6 md:p-8" style={{ background: '#111', color: '#F3F0EA' }}>
              {v.answer ? (
                <div className="flex flex-col gap-3">
                  <p className="pub-serif m-0 text-[36px] leading-tight">Thank you.</p>
                  <p className="m-0 text-[15px] leading-relaxed" style={{ color: '#D8D3C8' }}>
                    {v.answer === 'approved' ? `We’ll go ahead${name ? ` with ${name}` : ''} and keep you updated.` : 'We won’t go ahead with this offer, and we’ll keep looking.'}
                    {v.answerNote ? ` Your note: “${v.answerNote}”` : ''}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <h2 className="pub-serif m-0 text-[34px] leading-tight">Happy for us to go ahead?</h2>
                  <p className="m-0 text-[15px]" style={{ color: '#C9C4BA' }}>We won’t take a holding deposit until we’ve heard from you.</p>
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything to add? (optional)" className="pub-input"
                    style={{ color: '#F3F0EA', borderBottomColor: '#F3F0EA' }} />
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => answer('approved')} disabled={!!sending} className="pub-btn" style={{ background: '#F3F0EA', color: '#111' }}>
                      {sending === 'approved' ? 'Sending…' : 'Happy to go ahead'}
                    </button>
                    <button type="button" onClick={() => answer('declined')} disabled={!!sending} className="pub-btn-ghost" style={{ borderColor: '#F3F0EA', color: '#F3F0EA', minHeight: 54 }}>
                      {sending === 'declined' ? 'Sending…' : 'Not this one'}
                    </button>
                  </div>
                  {answerError && <p className="m-0 text-[14px]" style={{ color: '#F2B8A2' }}>{answerError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className={`${wrap} pb-16 pt-12`}>
        <p className="m-0 text-[15px]">Any questions? Email <a className="pub-link" href="mailto:management@capitalrooms.co.uk">management@capitalrooms.co.uk</a> or call 0207 112 9163.</p>
      </section>
      {viewing != null && v.docs[viewing] && (() => {
        const d = v.docs[viewing], src = `/api/lu/${token}/file/${d.id}`
        return (
          <div role="dialog" aria-modal="true" aria-label={d.label} className="fixed inset-0 z-50 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', background: '#141312' }}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-8" style={{ color: '#F3F0EA' }}>
              <div className="min-w-0 flex-1">
                <p className="pub-eyebrow m-0" style={{ color: '#C9C4BA' }}>{viewing + 1} of {v.docs.length}</p>
                <p className="m-0 truncate text-[16px] font-medium">{d.label} <span style={{ color: '#9A978F' }}>· {d.fileName}</span></p>
              </div>
              {v.docs.length > 1 && <>
                <button type="button" onClick={() => setViewing((viewing - 1 + v.docs.length) % v.docs.length)} className="pub-btn-ghost" style={{ borderColor: '#F3F0EA', color: '#F3F0EA' }} aria-label="Previous document">←</button>
                <button type="button" onClick={() => setViewing((viewing + 1) % v.docs.length)} className="pub-btn-ghost" style={{ borderColor: '#F3F0EA', color: '#F3F0EA' }} aria-label="Next document">→</button>
              </>}
              <a href={src} target="_blank" rel="noreferrer" className="pub-btn-ghost no-underline" style={{ borderColor: '#F3F0EA', color: '#F3F0EA' }}>Full screen</a>
              <a href={`${src}?download=1`} className="pub-btn-ghost no-underline" style={{ borderColor: '#F3F0EA', color: '#F3F0EA' }}>Download</a>
              <button type="button" onClick={() => setViewing(null)} className="pub-btn-ghost" style={{ background: '#F3F0EA', color: '#111', borderColor: '#F3F0EA' }}>Close</button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-2 md:px-8 md:pb-6">
              {d.kind === 'pdf' ? (
                <PdfView key={d.id} src={src} title={d.label} className="h-full w-full max-w-5xl bg-white" />
              ) : d.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={src} alt={d.label} className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="text-center" style={{ color: '#F3F0EA' }}>
                  <p className="m-0 text-[16px]">This file can’t be shown here.</p>
                  <a href={`${src}?download=1`} className="pub-btn mt-4 no-underline" style={{ background: '#F3F0EA', color: '#111' }}>Download it</a>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </PublicShell>
  )
}
