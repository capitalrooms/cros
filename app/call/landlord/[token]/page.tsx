'use client'
// The landlord's page for the informal video call (24 Nov 2026). No login: the link is the key.
import { use, useEffect, useState } from 'react'

type Opt = { iso: string; label: string }
type State = { status: string; applicantFirstName: string; offered: Opt[]; ticked: string[]; chosen: Opt | null; outcome: string | null; rounds: number }

const page = { minHeight: '100vh', background: '#F6F3EC', color: '#17332B', fontFamily: 'Nunito, system-ui, sans-serif', padding: '24px max(16px, env(safe-area-inset-left,0px)) 40px' } as const
const card = { maxWidth: 520, margin: '0 auto', background: '#fff', border: '1px solid #DDE5DE', borderRadius: 16, padding: 20 } as const
const btn = { background: '#17332B', color: '#fff', border: 0, borderRadius: 999, padding: '12px 18px', fontWeight: 800, cursor: 'pointer' } as const

export default function LandlordCallPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [st, setSt] = useState<State | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  const [note, setNote] = useState('')

  async function load() {
    const r = await fetch(`/api/call/landlord/${token}`, { cache: 'no-store' })
    if (!r.ok) { setMsg('This link is not valid. Ask the office for a new one.'); return }
    const j: State = await r.json()
    setSt(j); setPicked(j.ticked)
  }
  useEffect(() => { load() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setMsg('')
    const r = await fetch(`/api/call/landlord/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: picked }) })
    const j = await r.json()
    setMsg(r.ok ? 'Thank you. We have sent your times to the applicant.' : (j.error || 'That did not save. Try again.'))
    if (r.ok) load()
  }
  async function answer(outcome: 'proceed' | 'decline' | 'notes') {
    const r = await fetch(`/api/call/landlord/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'outcome', outcome, note }) })
    setMsg(r.ok ? 'Thank you. The office has your answer.' : 'That did not save. Try again.')
  }

  if (!st) return <main style={page}><div style={card}>{msg || 'Loading…'}</div></main>
  const first = st.applicantFirstName
  return (
    <main style={page}>
      <div style={card}>
        <h1 style={{ fontFamily: 'Baloo 2, system-ui, sans-serif', fontSize: 26, margin: '0 0 6px' }}>Video call with {first}</h1>
        {st.status === 'booked' && st.chosen && (
          <>
            <p>{first} has picked <strong>{st.chosen.label}</strong>. They will call you then.</p>
            <p style={{ color: '#4E6158' }}>After the call, let us know how it went.</p>
            <p style={{ fontWeight: 800 }}>How did it go? Can we proceed?</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Any notes (optional)" style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid #DDE5DE' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button style={btn} onClick={() => answer('proceed')}>Yes, proceed</button>
              <button style={{ ...btn, background: '#fff', color: '#17332B', border: '1px solid #DDE5DE' }} onClick={() => answer('notes')}>Yes, with notes</button>
              <button style={{ ...btn, background: '#fff', color: '#17332B', border: '1px solid #DDE5DE' }} onClick={() => answer('decline')}>Not going ahead</button>
            </div>
          </>
        )}
        {st.status === 'closed' && <p>Thank you. Your answer has been recorded.</p>}
        {(st.status === 'awaiting_landlord_times' || st.status === 'times_offered' || st.status === 'needs_new_times') && (
          <>
            <p>Tick every time you are free for a short informal video call. {first} will choose one of them. Calls are usually weekday afternoons.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, margin: '14px 0' }}>
              {st.offered.map(o => (
                <label key={o.iso} style={{ border: '1px solid #DDE5DE', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', background: picked.includes(o.iso) ? '#E3ECE5' : '#fff' }}>
                  <input type="checkbox" checked={picked.includes(o.iso)} onChange={e => setPicked(p => e.target.checked ? [...p, o.iso] : p.filter(x => x !== o.iso))} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
            <button style={btn} onClick={save}>{st.status === 'times_offered' ? 'Save my times' : 'Send my times'}</button>
            <p style={{ color: '#4E6158', fontSize: 13 }}>You can change these until {first} picks a time.</p>
          </>
        )}
        {msg && <p style={{ fontWeight: 800 }}>{msg}</p>}
      </div>
    </main>
  )
}
