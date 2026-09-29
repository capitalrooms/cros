'use client'

// Review & send: preview every agreement and the invoice exactly as they will be attached, draft the
// covering email (branded Capital Rooms email, CC Harry), then send it from the system.

import { useEffect, useMemo, useRef, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export interface AgreementDoc {
  key: string
  label: string              // "Room 1 — Mr Ethan Longford"
  summary: string            // line used in the email, e.g. "Room 1 — Mr Ethan Longford, £944.80 per month from 16th October 2026"
  payload?: Record<string, unknown>
  error?: string
}

interface Props {
  agreements: AgreementDoc[]
  invoice: Record<string, unknown> | null
  invoiceIssue?: string
  invoiceTotal: string
  defaultTo: string[]
  greetingName: string
  property: string
  tenantBills: string[]
  landlordBills: string[]
}

interface Preview { key: string; label: string; url?: string; error?: string; busy?: boolean }

const DEFAULT_CC = 'harry@capitalrooms.co.uk'
const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
const splitEmails = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

function suggestedMessage(p: Props, withInvoice: boolean): string {
  const n = p.agreements.length
  const lower = (xs: string[]) => xs.map(x => (x.startsWith('TV') ? x : x.toLowerCase()))
  const bills = !p.tenantBills.length
    ? 'All bills are included in the rent and paid by you.'
    : !p.landlordBills.length
      ? 'Please note that your tenants will be paying all of the bills themselves.'
      : `Please note that your tenants will be paying the ${list(lower(p.tenantBills))} themselves; the ${list(lower(p.landlordBills))} ${p.landlordBills.length === 1 ? 'is' : 'are'} included in the rent.`
  return [
    `Dear ${p.greetingName},`,
    `Please find attached the ${n} proposed tenancy agreement${n === 1 ? '' : 's'}${p.property ? ` for ${p.property}` : ''}:`,
    p.agreements.map(a => `• ${a.summary}`).join('\n'),
    bills,
    `Please have a read through and let me know if anything needs changing. When you are happy, we will send ${n === 1 ? 'it' : 'them'} to your tenants for signature.`,
    ...(withInvoice ? [`Our invoice for preparing the agreements (${p.invoiceTotal}) is also attached.`] : []),
    'Kind regards,',
  ].join('\n\n')
}

export default function SendToLandlord(props: Props) {
  const { agreements, invoice, invoiceIssue, defaultTo, property } = props
  const [attachInvoice, setAttachInvoice] = useState(true)
  const withInvoice = attachInvoice && !!invoice

  // ── Documents ──────────────────────────────────────────────────────────
  const [previews, setPreviews] = useState<Preview[]>([])
  const [active, setActive] = useState('')
  const [previewSig, setPreviewSig] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const sig = useMemo(() => JSON.stringify({ a: agreements.map(a => a.payload ?? a.error), i: withInvoice ? invoice : null }), [agreements, invoice, withInvoice])
  const upToDate = previews.length > 0 && previewSig === sig && previews.every(p => p.url)
  const blockers = agreements.filter(a => !a.payload)
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), [])

  async function previewDocuments() {
    setPreviewing(true); setResult(null)
    urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current = []
    const jobs: { key: string; label: string; path: string; body: unknown }[] = [
      ...agreements.map(a => ({ key: a.key, label: a.label, path: '/api/admin/bulk-tenancy-generator', body: a.payload })),
      ...(withInvoice ? [{ key: 'invoice', label: `Invoice — ${props.invoiceTotal}`, path: '/api/admin/landlord-invoice', body: invoice }] : []),
    ]
    const signature = sig
    setPreviews(jobs.map(j => ({ key: j.key, label: j.label, busy: true })))
    setActive(jobs[0]?.key ?? '')
    for (const j of jobs) {
      let next: Preview
      try {
        const res = await adminFetch(j.path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(j.body) })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`)
        const url = URL.createObjectURL(await res.blob())
        urls.current.push(url)
        next = { key: j.key, label: j.label, url }
      } catch (e) {
        next = { key: j.key, label: j.label, error: e instanceof Error ? e.message : 'Could not create this document' }
      }
      setPreviews(prev => prev.map(p => (p.key === j.key ? next : p)))
    }
    setPreviewSig(signature)
    setPreviewing(false)
  }

  // ── Email ──────────────────────────────────────────────────────────────
  const suggestedSubject = `Tenancy agreements for your review${property ? ` — ${property}` : ''}`
  const suggested = suggestedMessage(props, withInvoice)
  const [to, setTo] = useState(defaultTo.join(', '))
  const [cc, setCc] = useState(DEFAULT_CC)
  const [subject, setSubject] = useState(suggestedSubject)
  const [subjectEdited, setSubjectEdited] = useState(false)
  const [message, setMessage] = useState(suggested)
  const [messageEdited, setMessageEdited] = useState(false)
  const [emailHtml, setEmailHtml] = useState('')
  const [emailErr, setEmailErr] = useState('')
  const [fromLine, setFromLine] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { setTo(defaultTo.join(', ')) }, [defaultTo.join(',')])
  useEffect(() => { if (!subjectEdited) setSubject(suggestedSubject) }, [suggestedSubject, subjectEdited])
  useEffect(() => { if (!messageEdited) setMessage(suggested) }, [suggested, messageEdited])

  // Live preview of the email exactly as the landlord will see it (branded wrapper applied server-side)
  useEffect(() => {
    if (!message.trim()) { setEmailHtml(''); return }
    const t = setTimeout(async () => {
      try {
        const res = await adminFetch('/api/admin/bulk-tenancy-generator/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: true, message }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? 'Could not preview the email')
        setEmailHtml(d.html); setFromLine(d.from ?? ''); setEmailErr('')
      } catch (e) { setEmailErr(e instanceof Error ? e.message : 'Could not preview the email') }
    }, 500)
    return () => clearTimeout(t)
  }, [message])

  const toList = splitEmails(to), ccList = splitEmails(cc)
  const badEmails = [...toList, ...ccList].filter(e => !isEmail(e))
  const canSend = upToDate && !blockers.length && toList.length > 0 && !badEmails.length && subject.trim() && message.trim() && !sending
  const why = blockers.length ? blockers[0].error
    : !previews.length ? 'Preview the documents first — you’ll be able to send once you’ve seen them.'
    : previewing ? 'Creating the documents…'
    : !upToDate ? (previews.some(p => p.error) ? 'Some documents could not be created — fix the issue and preview again.' : 'Something changed since you previewed — preview the documents again before sending.')
    : !toList.length ? 'Add the landlord’s email address.'
    : badEmails.length ? `Check the email address: ${badEmails.join(', ')}`
    : ''

  async function send() {
    const docCount = agreements.length + (withInvoice ? 1 : 0)
    if (!window.confirm(`Send ${docCount} document${docCount === 1 ? '' : 's'} to ${toList.join(', ')}${ccList.length ? ` (cc ${ccList.join(', ')})` : ''}?`)) return
    setSending(true); setResult(null)
    try {
      const res = await adminFetch('/api/admin/bulk-tenancy-generator/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toList, cc: ccList, subject, message, agreements: agreements.map(a => a.payload), invoice: withInvoice ? invoice : null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `The email was not sent (error ${res.status})`)
      const at = new Date(d.sentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      setResult({ ok: true, text: `Sent at ${at} to ${d.to.join(', ')}${d.cc?.length ? `, cc ${d.cc.join(', ')}` : ''} with ${d.attachments.length} attachment${d.attachments.length === 1 ? '' : 's'}.` })
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : 'The email was not sent' })
    } finally { setSending(false) }
  }

  const current = previews.find(p => p.key === active)
  const label = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'
  const input = 'w-full rounded-lg border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900'

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="text-sm font-bold text-neutral-900">Review and send to the landlord</p>
          <p className="text-xs text-neutral-500 mt-xs">Check every document and the email as the landlord will see them, then send from here. You can still download them above and email them yourself.</p>
        </div>
        <button type="button" onClick={previewDocuments} disabled={previewing || !agreements.length || blockers.length > 0}
          className="rounded-lg bg-neutral-900 text-white px-lg py-sm text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">
          {previewing ? 'Creating documents…' : previews.length ? 'Preview again' : `Preview ${agreements.length + (withInvoice ? 1 : 0)} documents`}
        </button>
      </div>

      <label className="flex items-center gap-sm text-sm text-neutral-800">
        <input type="checkbox" className="w-4 h-4" checked={withInvoice} disabled={!invoice} onChange={e => setAttachInvoice(e.target.checked)} />
        Attach our invoice{invoice ? ` (${props.invoiceTotal})` : ''}
        {!invoice && invoiceIssue && <span className="text-xs text-amber-700">— {invoiceIssue}</span>}
      </label>

      {/* Documents */}
      {previews.length > 0 && (
        <div className="grid gap-md lg:grid-cols-[240px_1fr]">
          <div className="flex lg:flex-col gap-xs overflow-x-auto">
            {previews.map(p => (
              <button key={p.key} type="button" onClick={() => setActive(p.key)}
                className={`shrink-0 text-left rounded-lg border px-sm py-xs text-sm ${active === p.key ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-400'}`}>
                <span className={`mr-xs ${p.error ? 'text-red-600' : p.url ? 'text-green-700' : 'text-neutral-400'}`}>{p.error ? '✕' : p.url ? '✓' : '…'}</span>
                {p.label}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-100 overflow-hidden">
            {current?.url ? (
              <>
                <iframe key={current.url} src={current.url} title={current.label} className="w-full h-[70vh] bg-white" />
                <div className="flex justify-end px-sm py-xs bg-white border-t border-neutral-200">
                  <a href={current.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-neutral-700 hover:underline">Open in a new tab ↗</a>
                </div>
              </>
            ) : current?.error ? (
              <p className="p-lg text-sm text-red-700">{current.error}</p>
            ) : (
              <p className="p-lg text-sm text-neutral-500">Creating {current?.label ?? 'document'}…</p>
            )}
          </div>
        </div>
      )}
      {previews.length > 0 && !previewing && !upToDate && !previews.some(p => p.error) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-md py-xs text-sm text-amber-800">You changed something after previewing — preview again so you see exactly what will be sent.</p>
      )}

      {/* Email */}
      <div className="grid gap-lg lg:grid-cols-2">
        <div className="space-y-md">
          <div>
            <label className={label}>To</label>
            <input className={input} value={to} onChange={e => setTo(e.target.value)} placeholder="landlord@example.com" />
          </div>
          <div>
            <label className={label}>CC</label>
            <input className={input} value={cc} onChange={e => setCc(e.target.value)} />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className={label}>Subject</label>
              {subjectEdited && <button type="button" onClick={() => setSubjectEdited(false)} className="text-xs text-neutral-500 hover:underline">Use suggested</button>}
            </div>
            <input className={input} value={subject} onChange={e => { setSubject(e.target.value); setSubjectEdited(true) }} />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className={label}>Message</label>
              {messageEdited && <button type="button" onClick={() => setMessageEdited(false)} className="text-xs text-neutral-500 hover:underline">Use suggested wording</button>}
            </div>
            <textarea rows={16} className={`${input} leading-relaxed`} value={message} onChange={e => { setMessage(e.target.value); setMessageEdited(true) }} />
            <p className="text-[11px] text-neutral-400 mt-xs">Leave a blank line between paragraphs. Lines starting with • become a list.</p>
          </div>
        </div>
        <div>
          <label className={label}>How the landlord will see it</label>
          <div className="rounded-lg border border-neutral-200 overflow-hidden bg-white">
            <div className="px-md py-sm border-b border-neutral-100 text-xs text-neutral-600 space-y-[2px]">
              <p><span className="text-neutral-400">From</span> {fromLine || '…'}</p>
              <p><span className="text-neutral-400">To</span> {toList.join(', ') || '—'}{ccList.length ? <> · <span className="text-neutral-400">Cc</span> {ccList.join(', ')}</> : null}</p>
              <p className="font-semibold text-neutral-900">{subject || '(no subject)'}</p>
              <p className="text-neutral-400">📎 {agreements.length + (withInvoice ? 1 : 0)} attachments</p>
            </div>
            {emailErr ? <p className="p-md text-sm text-red-700">{emailErr}</p>
              : <iframe title="Email preview" srcDoc={emailHtml} sandbox="" className="w-full h-[640px] bg-white" />}
          </div>
        </div>
      </div>

      {result && (
        <div className={`rounded-lg border px-md py-sm text-sm ${result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{result.text}</div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-md pt-sm border-t border-neutral-100">
        <p className="text-xs text-neutral-500">{why}</p>
        <button type="button" onClick={send} disabled={!canSend}
          className="rounded-lg bg-neutral-900 text-white px-lg py-sm text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">
          {sending ? 'Sending…' : 'Send to landlord'}
        </button>
      </div>
    </div>
  )
}
