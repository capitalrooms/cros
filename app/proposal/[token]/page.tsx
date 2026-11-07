'use client'

// The landlord's improvement proposal (7 Nov 2026 — migration 273, lib/house/proposals). A walk through each space's
// redesigns: choose a favourite or "not this one", note anything, give a rough spending ceiling, send. Private link.
import { use, useEffect, useState } from 'react'
import PublicShell from '@/components/public/PublicShell'

type Space = { id: string; label: string; note: string; cost: string | null; designs: { style: string; brief: string; items: string[]; cost: string; url: string | null }[] }

export default function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [d, setD] = useState<{ house: string; intro: string; spaces: Space[]; answeredAt: string | null } | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<Record<string, { choice: number | 'none' | null; note: string }>>({})
  const [budget, setBudget] = useState('')
  const [comments, setComments] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const wrap = 'mx-auto max-w-6xl px-6 md:px-14'

  useEffect(() => {
    fetch(`/api/proposal/${encodeURIComponent(token)}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); if (j.answeredAt) setDone(true) }).catch(e => setErr(e.message ?? 'This link isn’t working'))
  }, [token])

  async function send() {
    setSending(true)
    const r = await fetch(`/api/proposal/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spaces: pick, budget, comments }) })
    setSending(false)
    if (r.ok) setDone(true); else setErr('That didn’t send — please try again, or reply to our email.')
  }

  if (err) return <PublicShell label="Ideas"><section className={`${wrap} py-20 text-[17px]`}>{err}</section></PublicShell>
  if (!d) return <PublicShell label="Ideas"><section className={`${wrap} py-20 text-[17px]`}>Loading…</section></PublicShell>
  if (done) return (
    <PublicShell label="Ideas">
      <section className={`${wrap} py-20`}><h1 className="pub-serif m-0 text-[44px] leading-tight">Thank you — <span className="italic">we’ve got it.</span></h1>
        <p className="mt-4 text-[17px]">We’ll look at what you’ve chosen and come back to you with what’s possible within your budget.</p></section>
    </PublicShell>
  )
  return (
    <PublicShell label="Ideas">
      <section className={`${wrap} pt-10 md:pt-14`}>
        <p className="pub-eyebrow m-0">Ideas for {d.house}</p>
        <h1 className="pub-serif m-0 mt-2 text-[40px] leading-tight md:text-[56px]">A fresh look, <span className="italic">no building work.</span></h1>
        {d.intro && <div className="mt-4 max-w-2xl space-y-3 text-[17px] leading-relaxed" style={{ color: '#4A4741' }}>{d.intro.split(/\n{2,}/).map((p, i) => <p key={i} className="m-0">{p}</p>)}</div>}
        <p className="pub-muted mt-3 max-w-2xl text-[14px]">Every idea keeps the walls, windows and layout as they are — only the decor, furniture and lighting change. Pictures are illustrations of the idea, not exact products.</p>
      </section>

      {d.spaces.map(sp => {
        const mine = pick[sp.id] ?? { choice: null, note: '' }
        const choose = (c: number | 'none') => setPick({ ...pick, [sp.id]: { ...mine, choice: mine.choice === c ? null : c } })
        return (
          <section key={sp.id} className={`${wrap} pt-14`}>
            <h2 className="pub-h2 m-0">{sp.label}</h2>
            <p className="pub-muted m-0 mt-1 text-[15px]">What we noticed: {sp.note}{sp.cost ? ` · our rough cost: ${sp.cost}` : ''}</p>
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              {sp.designs.map((g, i) => (
                <button key={i} type="button" onClick={() => choose(i)} aria-pressed={mine.choice === i} className="flex flex-col overflow-hidden text-left" style={{ border: mine.choice === i ? '2px solid #111' : '1px solid #DAD5CB', background: '#fff' }}>
                  {g.url && <img src={g.url} alt={g.style} className="aspect-[4/3] w-full object-cover" />}
                  <span className="flex flex-col gap-1 p-4">
                    <span className="pub-serif text-[22px]">{g.style}{mine.choice === i ? ' ✓' : ''}</span>
                    <span className="text-[14px]" style={{ color: '#4A4741' }}>{g.brief}</span>
                    {g.items.length > 0 && <span className="text-[13px]" style={{ color: '#6F6A60' }}>{g.items.join(' · ')}</span>}
                    <span className="text-[13px] font-semibold">Roughly {g.cost}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button type="button" className={`pub-pill ${mine.choice === 'none' ? 'on' : ''}`} onClick={() => choose('none')}>Not for now</button>
              <input className="pub-input min-w-[260px] flex-1" placeholder="Anything to add about this space? (optional)" value={mine.note} onChange={e => setPick({ ...pick, [sp.id]: { ...mine, note: e.target.value } })} />
            </div>
          </section>
        )
      })}

      <section className={`${wrap} pt-14 pb-20`}>
        <div className="flex max-w-3xl flex-col gap-5">
          <h2 className="pub-h2 m-0">Your <span className="italic">budget</span></h2>
          <label className="pub-label">Roughly what would you be happy for us to spend to get the look you’ve chosen?
            <input className="pub-input" placeholder="e.g. up to £1,500 — or “keep it as low as possible”" value={budget} onChange={e => setBudget(e.target.value)} /></label>
          <p className="pub-muted m-0 text-[14px]">We’ll aim for the main features within it and come back to you with what’s possible before anything is done.</p>
          <label className="pub-label">Anything else? (optional)
            <textarea className="pub-input" rows={3} value={comments} onChange={e => setComments(e.target.value)} /></label>
          <button type="button" className="pub-btn self-start" disabled={sending} onClick={send}>{sending ? 'Sending…' : 'Send my choices'}</button>
        </div>
      </section>
    </PublicShell>
  )
}
