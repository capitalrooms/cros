'use client'

// Email one saved statement to the landlord: preview the PDF and the email exactly as they'll get it,
// edit the subject/message, CC Harry by default, send from the signed-in admin.
import { useEffect, useRef, useState } from 'react'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const split = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)

export default function StatementSend({ statementId, label, sentAt, onSent }: { statementId: string; label: string; sentAt?: string | null; onSent?: () => void }) {
  const [open, setOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [html, setHtml] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('harry@capitalrooms.co.uk')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<'pdf' | 'email'>('pdf')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [prior, setPrior] = useState<{ at: string; to: string } | null>(null)
  const [invoices, setInvoices] = useState<string[]>([])
  const [withInvoices, setWithInvoices] = useState(true)
  const url = useRef('')
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])

  async function start() {
    setOpen(true); setLoading(true); setError(''); setDone('')
    try {
      const [pdfRes, prevRes] = await Promise.all([
        adminFetch(`/api/admin/statements/${statementId}/pdf`),
        adminFetch(`/api/admin/statements/${statementId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: true }) }),
      ])
      if (!pdfRes.ok) throw new Error((await pdfRes.json().catch(() => ({}))).error || 'Could not build the PDF')
      const prev = await prevRes.json().catch(() => ({}))
      if (!prevRes.ok) throw new Error(prev.error || 'Could not build the email')
      if (url.current) URL.revokeObjectURL(url.current)
      url.current = URL.createObjectURL(await pdfRes.blob())
      setPdfUrl(url.current)
      setTo(prev.to || ''); setSubject(prev.subject); setMessage(prev.message); setHtml(prev.html); setFrom(prev.from); setPrior(prev.alreadySent); setInvoices(prev.invoices ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare the email') }
    finally { setLoading(false) }
  }

  async function refreshEmail() {
    const r = await adminFetch(`/api/admin/statements/${statementId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: true, message }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) setHtml(d.html)
  }

  async function send() {
    const bad = [...split(to), ...split(cc)].find(e => !isEmail(e))
    if (!split(to).length) return setError('Add the landlord’s email address.')
    if (bad) return setError(`“${bad}” isn’t a valid email address.`)
    setSending(true); setError('')
    try {
      const r = await adminFetch(`/api/admin/statements/${statementId}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, cc, subject, message, include_invoices: withInvoices }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'The email could not be sent.')
      setDone(d.warning || `Sent to ${to}${cc ? ` (cc ${cc})` : ''}.`)
      onSent?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'The email could not be sent.') }
    finally { setSending(false) }
  }

  const input = 'mt-xs w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'

  return (
    <>
      <div className="flex flex-wrap items-center gap-sm">
        <button type="button" onClick={() => downloadPdf(`/api/admin/statements/${statementId}/pdf`, `Statement ${label}.pdf`)} className="rounded-lg border border-neutral-300 bg-white px-md py-xs text-xs font-bold text-neutral-800">PDF</button>
        <button type="button" onClick={start} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white">{sentAt ? 'Send again' : 'Email to landlord'}</button>
        {sentAt && <span className="text-xs text-neutral-500">Sent {new Date(sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md" onClick={() => !sending && setOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-lg py-md">
              <h2 className="font-bold text-neutral-900">Email statement {label}</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700" aria-label="Close">✕</button>
            </div>
            {loading ? <p className="p-lg text-sm text-neutral-500">Building the statement…</p> : (
              <div className="grid min-h-0 flex-1 gap-lg overflow-y-auto p-lg md:grid-cols-[1fr_1.2fr]">
                <div className="space-y-md">
                  {prior && <p className="rounded-lg bg-amber-50 px-md py-sm text-xs text-amber-800">Already sent {new Date(prior.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} to {prior.to}.</p>}
                  <label className="block text-xs font-semibold text-neutral-700">To<input className={input} value={to} onChange={e => setTo(e.target.value)} placeholder="landlord@example.com" /></label>
                  <label className="block text-xs font-semibold text-neutral-700">CC<input className={input} value={cc} onChange={e => setCc(e.target.value)} /></label>
                  <label className="block text-xs font-semibold text-neutral-700">Subject<input className={input} value={subject} onChange={e => setSubject(e.target.value)} /></label>
                  <label className="block text-xs font-semibold text-neutral-700">Message<textarea className={input} rows={9} value={message} onChange={e => setMessage(e.target.value)} onBlur={refreshEmail} /></label>
                  <div className="rounded-lg bg-neutral-50 px-md py-sm text-xs text-neutral-700">
                    <p className="font-semibold">Attached: the statement PDF{invoices.length && withInvoices ? ` and ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}` : ''}</p>
                    {invoices.length > 0 && (
                      <label className="mt-xs flex items-start gap-sm">
                        <input type="checkbox" checked={withInvoices} onChange={e => setWithInvoices(e.target.checked)} className="mt-0.5" />
                        <span>Include the invoices you chose to share: {invoices.join(', ')}</span>
                      </label>
                    )}
                  </div>
                  {from && <p className="text-xs text-neutral-500">From {from} · replies come to you.</p>}
                  {error && <p className="rounded-lg bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
                  {done && <p className="rounded-lg bg-green-50 px-md py-sm text-sm text-green-800">{done}</p>}
                  <button disabled={sending || !!done} onClick={send} className="w-full rounded-lg bg-neutral-900 py-md text-sm font-bold text-white disabled:bg-neutral-300">
                    {sending ? 'Sending…' : done ? 'Sent' : 'Send statement'}
                  </button>
                </div>
                <div className="flex min-h-[420px] flex-col">
                  <div className="mb-sm inline-flex self-start rounded-lg bg-neutral-100 p-0.5 text-xs font-bold">
                    <button onClick={() => setTab('pdf')} className={`rounded-md px-md py-xs ${tab === 'pdf' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>Statement PDF</button>
                    <button onClick={() => setTab('email')} className={`rounded-md px-md py-xs ${tab === 'email' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>Email</button>
                  </div>
                  {tab === 'pdf'
                    ? (pdfUrl ? <iframe src={pdfUrl} title="Statement PDF" className="w-full flex-1 rounded-lg border border-neutral-200" /> : null)
                    : <iframe srcDoc={html} title="Email preview" className="w-full flex-1 rounded-lg border border-neutral-200 bg-white" />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
