'use client'
// "Request a viewing" on a room's page (12 Nov 2026, Harry): pick up to 3 times that suit you in the next week —
// Monday to Friday, lunchtime 12:00–1:30pm or evenings 5:00–6:30pm (lib/lettings/viewingSlots) — and lettings confirms
// one. Sent to /api/site/viewing-request; a hidden field and a minimum time on the page keep bots out.
import { useRef, useState } from 'react'
import { requestDays, LUNCH, EVENING, MAX_SLOTS, slotLabel } from '@/lib/lettings/viewingSlots'

const t12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}` }
const dayShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function RequestViewing({ roomId, unit = 'room' }: { roomId: string; unit?: string }) {
  const days = requestDays()
  const [day, setDay] = useState(days[0] ?? '')
  const [picked, setPicked] = useState<{ date: string; time: string }[]>([])
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [message, setMessage] = useState('')
  const [hp, setHp] = useState('')
  const [state, setState] = useState<'' | 'sending' | 'sent'>('')
  const [err, setErr] = useState('')
  const started = useRef(Date.now())
  const has = (time: string) => picked.some(p => p.date === day && p.time === time)
  const toggle = (time: string) => setPicked(ps => has(time) ? ps.filter(p => !(p.date === day && p.time === time)) : ps.length >= MAX_SLOTS ? ps : [...ps, { date: day, time }])

  async function send() {
    setErr('')
    if (!picked.length) { setErr('Choose at least one time that suits you.'); return }
    if (!name.trim()) { setErr('Please add your name.'); return }
    if (!email.trim() && !phone.trim()) { setErr('Please add an email or mobile so we can confirm.'); return }
    setState('sending')
    const r = await fetch('/api/site/viewing-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, name, email, phone, message, slots: picked, website: hp, ms: Date.now() - started.current }) }).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    if (!r?.ok) { setState(''); setErr(d?.error || 'That didn’t go through — please call us on 0207 112 9163.'); return }
    setState('sent')
  }

  const chip = (on: boolean): React.CSSProperties => ({ padding: '8px 12px', borderRadius: 999, border: `1px solid ${on ? '#111' : '#D9D4CA'}`, background: on ? '#111' : '#fff', color: on ? '#fff' : '#111', fontSize: 14, fontWeight: 600, cursor: 'pointer' })
  const input: React.CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #D9D4CA', fontSize: 16, background: '#fff', color: '#111' }
  if (state === 'sent') return (
    <div style={{ border: '1px solid #E4E0D8', borderRadius: 16, padding: 20, background: '#fff' }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Thanks — we’ve got your request</p>
      <p style={{ margin: '8px 0 0', color: '#4A4741' }}>We’ll confirm one of these times shortly by text or email:</p>
      <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>{picked.map(p => <li key={p.date + p.time}>{slotLabel(p.date, p.time)}</li>)}</ul>
    </div>
  )
  return (
    <div style={{ border: '1px solid #E4E0D8', borderRadius: 16, padding: 20, background: '#fff', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, color: '#4A4741', fontSize: 15 }}>Choose up to {MAX_SLOTS} times that suit you in the next week and we’ll confirm one. Viewings are Monday to Friday, at lunchtime (12–1:30pm) or in the evening (5–6:30pm).</p>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {days.map(d => <button key={d} type="button" onClick={() => setDay(d)} style={{ ...chip(d === day), whiteSpace: 'nowrap', position: 'relative' }}>{dayShort(d)}{picked.some(p => p.date === d) ? ' •' : ''}</button>)}
      </div>
      {[['Lunchtime', LUNCH], ['Evening', EVENING]].map(([label, times]) => (
        <div key={label as string}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6F6A60' }}>{label as string}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{(times as string[]).map(t => <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={has(t)} style={chip(has(t))}>{t12(t)}</button>)}</div>
        </div>
      ))}
      <p style={{ margin: 0, fontSize: 14, color: picked.length ? '#111' : '#6F6A60' }}>{picked.length ? `Your times: ${picked.map(p => slotLabel(p.date, p.time)).join(' · ')}` : `No times chosen yet (up to ${MAX_SLOTS}).`}</p>
      <input style={input} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
      <input style={input} placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      <input style={input} placeholder="Mobile" type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
      <textarea style={{ ...input, minHeight: 70 }} placeholder={`Anything we should know? (optional) — e.g. when you'd like to move into the ${unit}`} value={message} onChange={e => setMessage(e.target.value)} />
      <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={hp} onChange={e => setHp(e.target.value)} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} name="website" />
      {err && <p style={{ margin: 0, color: '#9B2C1F', fontSize: 14 }}>{err}</p>}
      <button type="button" onClick={send} disabled={state === 'sending'} style={{ padding: '13px 20px', borderRadius: 999, background: '#111', color: '#fff', fontWeight: 600, fontSize: 15, border: 0, cursor: 'pointer' }}>{state === 'sending' ? 'Sending…' : 'Request a viewing'}</button>
    </div>
  )
}
