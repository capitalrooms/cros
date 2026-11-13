'use client'
// Unsubscribe from Capital Rooms marketing (13 Nov 2026) — from the link in market updates and news. One press.
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function Inner() {
  const q = useSearchParams()
  const a = q.get('a') ?? '', t = q.get('t') ?? ''
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'error'>('ask')
  const [err, setErr] = useState('')
  async function go() {
    setState('busy')
    const r = await fetch('/api/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, t }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) setState('done'); else { setErr(j.error || 'That didn’t work'); setState('error') }
  }
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F3F0E6', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#1B1A17' }}>
      <div style={{ maxWidth: 440, background: '#fff', borderRadius: 20, padding: 32, boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
        <p style={{ margin: 0, letterSpacing: 4, fontSize: 13, color: '#1F3B2E' }}>CAPITAL ROOMS</p>
        {state === 'done' ? (<>
          <h1 style={{ fontSize: 24, margin: '12px 0 8px' }}>You’re unsubscribed</h1>
          <p style={{ lineHeight: 1.6, margin: 0 }}>We won’t send market updates or news to {a} any more. Anything about your own properties or tenancy — statements, repairs, documents — still comes as usual.</p>
        </>) : (<>
          <h1 style={{ fontSize: 24, margin: '12px 0 8px' }}>Stop market updates and news?</h1>
          <p style={{ lineHeight: 1.6, margin: '0 0 20px' }}>For <b>{a || 'this address'}</b>. Anything about your own properties or tenancy will still come.</p>
          <button type="button" onClick={go} disabled={state === 'busy' || !a} style={{ background: '#1F3B2E', color: '#fff', border: 0, borderRadius: 999, padding: '12px 22px', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>{state === 'busy' ? 'One moment…' : 'Unsubscribe'}</button>
          {state === 'error' && <p style={{ color: '#B5361F', marginTop: 12 }}>{err}</p>}
        </>)}
      </div>
    </main>
  )
}
export default function Unsubscribe() { return <Suspense><Inner /></Suspense> }
