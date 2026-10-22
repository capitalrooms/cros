'use client'

// How are we doing? — the tenant feedback form sent from Quick Notify (22 Oct 2026). Each area 1–5 with an optional
// "how could it be better?"; answers go to the office only.
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { FEEDBACK_AREAS, SCORE_WORDS } from '@/lib/feedback/areas'

export default function TenantFeedbackPage() {
  const [house, setHouse] = useState<string | null | undefined>(undefined)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [anything, setAnything] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    adminFetch('/api/tenant/feedback').then(r => r.json()).then(d => { setHouse(d.house ?? null); setLastSentAt(d.lastSentAt ?? null) }).catch(() => setHouse(null))
  }, [])

  const scored = Object.keys(ratings).length
  const send = async () => {
    setSending(true); setError(null)
    try {
      const r = await adminFetch('/api/tenant/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ratings, comments, anything_else: anything }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Your answers didn’t send — please try again.'); return }
      setDone(true); window.scrollTo({ top: 0 })
    } catch { setError('Couldn’t reach us — check your connection and try again.') }
    finally { setSending(false) }
  }

  if (done) return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-3xl text-center">
        <div className="mb-lg text-5xl">🙏</div>
        <h1 className="mb-sm text-2xl font-bold text-neutral-900">Thank you</h1>
        <p className="mb-xl text-sm text-neutral-600">We read every answer and use them to decide what to improve at {house ?? 'the house'} first.</p>
        <a href="/tenant" className="inline-block rounded-xl bg-neutral-900 px-xl py-md text-sm font-bold text-white">Back to home</a>
      </main>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-50 pb-3xl">
      <AppBar left={<BackButton href="/tenant" />} />
      <main className="mx-auto max-w-lg px-lg py-lg">
        <h1 className="mb-xs text-2xl font-bold text-neutral-900">How are we doing?</h1>
        {house === undefined ? <p className="text-sm text-neutral-400">Loading…</p>
          : house === null ? <p className="text-sm text-neutral-500">We couldn’t find a house you live in now. If that looks wrong, please get in touch.</p>
          : <>
            <p className="mb-lg text-sm text-neutral-500">Score each part of {house} from 1 to 5 and tell us how it could be better. Skip anything your house doesn’t have. Your answers go to the office only — never to your housemates or the landlord.</p>
            {lastSentAt && <p className="mb-lg rounded-xl bg-blue-50 px-md py-sm text-xs text-blue-900">You last sent us feedback on {new Date(lastSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })}. Thanks — you’re welcome to send more.</p>}

            <div className="space-y-md">
              {FEEDBACK_AREAS.map(a => {
                const off = skipped.has(a.key), score = ratings[a.key]
                return (
                  <section key={a.key} className={`rounded-2xl border border-neutral-200 bg-white p-md ${off ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-sm">
                      <div>
                        <h2 className="font-bold text-neutral-900">{a.label}</h2>
                        <p className="text-xs text-neutral-500">{a.ask}</p>
                      </div>
                      <button onClick={() => { setSkipped(p => { const n = new Set(p); n.has(a.key) ? n.delete(a.key) : n.add(a.key); return n }); setRatings(r => { const n = { ...r }; delete n[a.key]; return n }) }}
                        className="shrink-0 text-xs font-semibold text-neutral-500 underline">{off ? 'Score it' : 'Not at my house'}</button>
                    </div>
                    {!off && <>
                      <div className="mt-sm grid grid-cols-5 gap-xs" role="radiogroup" aria-label={`${a.label} score`}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} role="radio" aria-checked={score === n} onClick={() => setRatings(r => ({ ...r, [a.key]: n }))}
                            className={`rounded-lg border py-sm text-center transition ${score === n ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}>
                            <span className="block text-lg font-bold">{n}</span>
                            <span className={`block text-[10px] ${score === n ? 'text-neutral-300' : 'text-neutral-400'}`}>{SCORE_WORDS[n]}</span>
                          </button>
                        ))}
                      </div>
                      {score !== undefined && (
                        <textarea rows={2} value={comments[a.key] ?? ''} onChange={e => setComments(c => ({ ...c, [a.key]: e.target.value }))}
                          placeholder={score >= 5 ? 'What do you like about it? (optional)' : 'How could it be better? (optional)'}
                          className="mt-sm w-full rounded-lg border border-neutral-200 px-md py-sm text-sm" />
                      )}
                    </>}
                  </section>
                )
              })}

              <section className="rounded-2xl border border-neutral-200 bg-white p-md">
                <h2 className="font-bold text-neutral-900">Anything else?</h2>
                <p className="text-xs text-neutral-500">The one thing you’d change, or anything we haven’t asked about</p>
                <textarea rows={3} value={anything} onChange={e => setAnything(e.target.value)} className="mt-sm w-full rounded-lg border border-neutral-200 px-md py-sm text-sm" />
              </section>
            </div>

            {error && <p className="mt-md rounded-xl border border-red-200 bg-red-50 p-md text-sm font-semibold text-red-800">{error}</p>}
            <button onClick={send} disabled={sending || (!scored && !anything.trim())}
              className="mt-lg w-full rounded-xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40">
              {sending ? 'Sending…' : scored ? `Send my answers (${scored} scored)` : 'Send my answers'}
            </button>
          </>}
      </main>
    </div>
  )
}
