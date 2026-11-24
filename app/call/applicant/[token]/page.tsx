'use client'
// The applicant's page for the informal video call (24 Nov 2026). No login: the link is the key.
import { use, useEffect, useState } from 'react'

type Opt = { iso: string; label: string }
type State = { status: string; firstName: string; landlordFirstName: string; options: Opt[]; chosen: string | null }

const page = { minHeight: '100vh', background: '#F6F3EC', color: '#17332B', fontFamily: 'Nunito, system-ui, sans-serif', padding: '24px max(16px, env(safe-area-inset-left,0px)) 40px' } as const
const card = { maxWidth: 520, margin: '0 auto', background: '#fff', border: '1px solid #DDE5DE', borderRadius: 16, padding: 20 } as const
const btn = { background: '#17332B', color: '#fff', border: 0, borderRadius: 999, padding: '12px 18px', fontWeight: 800, cursor: 'pointer', width: '100%', textAlign: 'left' } as const

export default function ApplicantCallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [st, setSt] = useState<State | null>(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const r = await fetch(`/api/call/applicant/${token}`, { cache: 'no-store' })
    if (!r.ok) { setMsg('This link is not valid. Reply to the email and the office will send a new one.'); return }
    setSt(await r.json())
  }
  useEffect(() => { load() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(slot: string) {
    setMsg('')
    const r = await fetch(`/api/call/applicant/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot }) })
    const j = await r.json()
    if (r.ok) { setMsg('Booked. The details are in your email.'); load() } else { setMsg(j.error || 'That did not save. Try again.'); load() }
  }
  async function cannot() {
    const r = await fetch(`/api/call/applicant/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cannot' }) })
    setMsg(r.ok ? 'Thanks. We have asked the landlord for other times and will email you.' : 'That did not save. Try again.')
  }

  if (!st) return <main style={page}><div style={card}>{msg || 'Loading…'}</div></main>
  return (
    <main style={page}>
      <div style={card}>
        <h1 style={{ fontFamily: 'Baloo 2, system-ui, sans-serif', fontSize: 26, margin: '0 0 6px' }}>Hello {st.firstName}</h1>
        {st.status === 'booked' || st.chosen ? (
          <p>Your informal video call with {st.landlordFirstName} is booked for <strong>{st.chosen}</strong>. The details are in your email.</p>
        ) : st.options.length ? (
          <>
            <p>The landlord has accepted your offer, subject to an informal video call. Please choose a time that suits you. Times are London time.</p>
            <div style={{ display: 'grid', gap: 8, margin: '14px 0' }}>
              {st.options.map(o => <button key={o.iso} style={btn} onClick={() => pick(o.iso)}>{o.label}</button>)}
            </div>
            <button style={{ ...btn, background: '#fff', color: '#17332B', border: '1px solid #DDE5DE' }} onClick={cannot}>None of these work for me</button>
          </>
        ) : (
          <p>We are waiting for the landlord to confirm some times. We will email you as soon as they are ready.</p>
        )}
        {msg && <p style={{ fontWeight: 800 }}>{msg}</p>}
      </div>
    </main>
  )
}
