'use client'

// One recipient's email in invoices-only mode: preview their invoice PDFs and the email exactly as they
// will receive it (branded Capital Rooms email), then send it — CC Harry by default.

import { useEffect, useRef, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export interface RecipientDoc { key: string; label: string; body: Record<string, unknown> }

interface Props {
  name: string
  to: string
  docs: RecipientDoc[]
  total: string
  suggestedSubject: string
  suggestedMessage: string
  onSent?: (text: string) => void
}

const splitEmails = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export default function RecipientSend({ name, to, docs, total, suggestedSubject, suggestedMessage, onSent }: Props) {
  const [open, setOpen] = useState(false)
  const [previews, setPreviews] = useState<{ key: string; label: string; url?: string; error?: string }[]>([])
  const [active, setActive] = useState('')
  const [previewSig, setPreviewSig] = useState('')
  const [busy, setBusy] = useState(false)
  const [cc, setCc] = useState('harry@capitalrooms.co.uk')
  const [subject, setSubject] = useState(suggestedSubject)
  const [subjectEdited, setSubjectEdited] = useState(false)
  const [message, setMessage] = useState(suggestedMessage)
  const [messageEdited, setMessageEdited] = useState(false)
  const [html, setHtml] = useState('')
  const [fromLine, setFromLine] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), [])
  useEffect(() => { if (!subjectEdited) setSubject(suggestedSubject) }, [suggestedSubject, subjectEdited])
  useEffect(() => { if (!messageEdited) setMessage(suggestedMessage) }, [suggestedMessage, messageEdited])

  const sig = JSON.stringify(docs.map(d => d.body))
  const upToDate = previews.length > 0 && previewSig === sig && previews.every(p => p.url)

  useEffect(() => {
    if (!open || !message.trim()) return
    const t = setTimeout(async () => {
      const res = await adminFetch('/api/admin/bulk-tenancy-generator/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: true, message }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setHtml(d.html); setFromLine(d.from ?? '') }
    }, 500)
    return () => clearTimeout(t)
  }, [message, open])

  async function preview() {
    setBusy(true); setResult(null); setOpen(true)
    urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current = []
    const signature = sig
    const out: typeof previews = []
    for (const d of docs) {
      try {
        const res = await adminFetch('/api/admin/landlord-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d.body) })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`)
        const url = URL.createObjectURL(await res.blob()); urls.current.push(url)
        out.push({ key: d.key, label: d.label, url })
      } catch (e) { out.push({ key: d.key, label: d.label, error: e instanceof Error ? e.message : 'Could not create this invoice' }) }
    }
    setPreviews(out); setActive(out[0]?.key ?? ''); setPreviewSig(signature); setBusy(false)
  }

  const toList = splitEmails(to), ccList = splitEmails(cc)
  const bad = [...toList, ...ccList].filter(e => !isEmail(e))
  const why = !toList.length ? 'Add their email address on the invoice above'
    : bad.length ? `Check the email address: ${bad.join(', ')}`
    : !upToDate ? (previews.length ? 'Something changed — preview again before sending' : 'Preview first — you can send once you’ve seen it')
    : ''

  async function send() {
    if (!window.confirm(`Send ${docs.length} invoice${docs.length === 1 ? '' : 's'} (${total}) to ${toList.join(', ')}${ccList.length ? `, cc ${ccList.join(', ')}` : ''}?`)) return
    setSending(true); setResult(null)
    try {
      const res = await adminFetch('/api/admin/bulk-tenancy-generator/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toList, cc: ccList, subject, message, agreements: [], invoices: docs.map(d => d.body) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `The email was not sent (error ${res.status})`)
      const text = `Sent at ${new Date(d.sentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} to ${d.to.join(', ')}${d.cc?.length ? `, cc ${d.cc.join(', ')}` : ''}`
      setResult({ ok: true, text }); onSent?.(text)
    } catch (e) { setResult({ ok: false, text: e instanceof Error ? e.message : 'The email was not sent' }) }
    finally { setSending(false) }
  }

  const current = previews.find(p => p.key === active)
  const input = 'w-full rounded-lg border border-neutral-200 bg-white px-sm py-xs text-sm text-neutral-900'
  const label = 'block text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-[2px]'

  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-md px-md py-sm">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">{name || 'Recipient not named'} <span className="font-normal text-neutral-500">· {docs.length} invoice{docs.length === 1 ? '' : 's'} · {total}</span></p>
          <p className="text-xs text-neutral-500 truncate">{toList.join(', ') || 'No email address yet'}</p>
          {result && <p className={`text-xs mt-[2px] ${result.ok ? 'text-green-700' : 'text-red-700'}`}>{result.ok ? '✓ ' : ''}{result.text}</p>}
        </div>
        <div className="flex items-center gap-sm">
          {open && <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500 hover:underline">Hide</button>}
          <button type="button" onClick={preview} disabled={busy}
            className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-40">
            {busy ? 'Creating…' : previews.length ? 'Preview again' : 'Preview'}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-neutral-100 p-md space-y-md">
          {previews.length > 0 && (
            <div>
              <div className="flex gap-xs overflow-x-auto mb-xs">
                {previews.map(p => (
                  <button key={p.key} type="button" onClick={() => setActive(p.key)}
                    className={`shrink-0 rounded-lg border px-sm py-[2px] text-xs ${active === p.key ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'}`}>
                    <span className={p.error ? 'text-red-600' : 'text-green-700'}>{p.error ? '✕ ' : '✓ '}</span>{p.label}
                  </button>
                ))}
              </div>
              {current?.url ? <iframe key={current.url} src={current.url} title={current.label} className="w-full h-[60vh] rounded-lg border border-neutral-200 bg-white" />
                : current?.error ? <p className="text-sm text-red-700">{current.error}</p> : null}
            </div>
          )}

          <div className="grid gap-md lg:grid-cols-2">
            <div className="space-y-sm">
              <div><label className={label}>CC</label><input className={input} value={cc} onChange={e => setCc(e.target.value)} /></div>
              <div>
                <div className="flex justify-between"><label className={label}>Subject</label>{subjectEdited && <button type="button" className="text-[11px] text-neutral-500 hover:underline" onClick={() => setSubjectEdited(false)}>Use suggested</button>}</div>
                <input className={input} value={subject} onChange={e => { setSubject(e.target.value); setSubjectEdited(true) }} />
              </div>
              <div>
                <div className="flex justify-between"><label className={label}>Message</label>{messageEdited && <button type="button" className="text-[11px] text-neutral-500 hover:underline" onClick={() => setMessageEdited(false)}>Use suggested wording</button>}</div>
                <textarea rows={12} className={`${input} leading-relaxed`} value={message} onChange={e => { setMessage(e.target.value); setMessageEdited(true) }} />
              </div>
            </div>
            <div>
              <label className={label}>How they will see it</label>
              <div className="rounded-lg border border-neutral-200 overflow-hidden">
                <div className="px-sm py-xs border-b border-neutral-100 text-xs text-neutral-600">
                  <p><span className="text-neutral-400">From</span> {fromLine || '…'}</p>
                  <p><span className="text-neutral-400">To</span> {toList.join(', ') || '—'}{ccList.length ? <> · <span className="text-neutral-400">Cc</span> {ccList.join(', ')}</> : null}</p>
                  <p className="font-semibold text-neutral-900">{subject}</p>
                  <p className="text-neutral-400">📎 {docs.length} attachment{docs.length === 1 ? '' : 's'}</p>
                </div>
                <iframe title={`Email to ${name}`} srcDoc={html} sandbox="" className="w-full h-[480px] bg-white" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-md pt-sm border-t border-neutral-100">
            <p className="text-xs text-neutral-500">{why}</p>
            <button type="button" onClick={send} disabled={!!why || sending}
              className="rounded-lg bg-neutral-900 text-white px-lg py-xs text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">
              {sending ? 'Sending…' : `Send to ${name.split(/\s+/).slice(0, 2).join(' ') || 'recipient'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
