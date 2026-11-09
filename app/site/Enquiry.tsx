'use client'
// One enquiry form for the website (contact, landlords, valuation, maintenance quote, communication preferences).
// It only ever emails the office — nothing is stored, nothing is uploaded. A hidden field catches bots.
import { useRef, useState } from 'react'

export type Field = { name: string; label: string; type?: 'text' | 'email' | 'tel' | 'number' | 'date' | 'textarea' | 'select'; options?: string[]; required?: boolean; full?: boolean; placeholder?: string }

export default function Enquiry({ kind, fields, submit = 'Send' }: { kind: string; fields: Field[]; submit?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const started = useRef(Date.now())
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const values: Record<string, string> = {}
    for (const f of fields) values[f.name] = String(fd.get(f.name) ?? '').trim()
    setState('sending'); setMsg('')
    const r = await fetch('/api/site/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, values, website: String(fd.get('website') ?? ''), ms: Date.now() - started.current }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (r?.ok) { setState('sent'); (e.target as HTMLFormElement).reset() } else { setState('error'); setMsg(d.error || 'That didn’t go through — please try again, or call us on 0207 112 9163.') }
  }
  if (state === 'sent') return <p className="note ok" role="status">Thank you — that’s with us. We’ll be in touch shortly.</p>
  return (
    <form className="f" onSubmit={send} noValidate={false}>
      {fields.map(f => (
        <label key={f.name} className={f.full || f.type === 'textarea' ? 'full' : ''}>{f.label}{f.required ? ' *' : ''}
          {f.type === 'textarea' ? <textarea name={f.name} required={f.required} maxLength={3000} placeholder={f.placeholder} />
            : f.type === 'select' ? <select name={f.name} required={f.required} defaultValue=""><option value="" disabled>Choose…</option>{f.options!.map(o => <option key={o}>{o}</option>)}</select>
            : <input name={f.name} type={f.type ?? 'text'} required={f.required} maxLength={200} placeholder={f.placeholder} autoComplete={f.name === 'name' ? 'name' : f.name === 'email' ? 'email' : f.name === 'phone' ? 'tel' : f.name === 'postcode' ? 'postal-code' : undefined} />}
        </label>
      ))}
      {/* people never see this; bots fill it in */}
      <label className="trap" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {state === 'error' && <p className="note bad full" role="alert">{msg}</p>}
      <div className="full"><button type="submit" className="btn" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : submit}</button></div>
      <p className="full" style={{ fontSize: 13, color: 'var(--muted)' }}>We use these details only to answer you. See our <a href="/privacy_policy">privacy policy</a>.</p>
    </form>
  )
}
