'use client'
import { useState } from 'react'
type Q = { id: string; label: string; amount: number; notes: string; recommended: boolean }
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export default function Decide({ token, quotes }: { token: string; quotes: Q[] }) {
  const [pick, setPick] = useState(quotes.find(q => q.recommended)?.id ?? quotes[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'' | 'approve' | 'decline'>('')
  const [err, setErr] = useState('')
  async function send(decision: 'approve' | 'decline') {
    setBusy(true); setErr('')
    const r = await fetch(`/api/approve/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, quoteId: pick, note }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (r?.ok) setDone(decision); else setErr(d.error || 'That didn’t work — please call us on 0207 112 9163.')
  }
  if (done) return <div className="ap-done">{done === 'approve' ? <><strong>Thank you — approved.</strong> We’ve booked the contractor and the tenant will be told when they’re coming.</> : <><strong>Thanks — we’ll hold off.</strong> We’ll be in touch to talk it through.</>}</div>
  return (
    <div className="ap-decide">
      <fieldset className="ap-quotes">
        <legend>Choose a quote</legend>
        {quotes.map(q => (
          <label key={q.id} className={`ap-quote ${pick === q.id ? 'on' : ''}`}>
            <input type="radio" name="q" checked={pick === q.id} onChange={() => setPick(q.id)} />
            <span className="ap-q-top"><strong>{q.label}</strong>{q.recommended && <span className="ap-tag">Our recommendation</span>}<span className="ap-amt">{gbp(q.amount)}</span></span>
            {q.notes && <span className="ap-notes">{q.notes}</span>}
          </label>
        ))}
      </fieldset>
      <label className="ap-note">A note for us (optional)<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000} /></label>
      {err && <p className="ap-err" role="alert">{err}</p>}
      <div className="ap-btns">
        <button type="button" disabled={busy || !pick} onClick={() => send('approve')} className="ap-yes">{busy ? 'Sending…' : `Approve ${quotes.find(q => q.id === pick)?.label ?? ''}`}</button>
        <button type="button" disabled={busy} onClick={() => send('decline')} className="ap-no">Hold off — call me</button>
      </div>
    </div>
  )
}
