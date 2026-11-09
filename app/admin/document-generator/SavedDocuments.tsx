'use client'

// Every letter and invoice made on this page: view, download, send again (to any address — e.g. when the first one
// bounced), edit, or delete (delete hides it; the record is kept).
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { dearFromText } from '@/lib/people'

interface Doc {
  id: string
  kind: 'invoice' | 'letter' | 'receipt'
  number: string | null
  title: string
  recipient_name: string
  recipient_email?: string | null
  total: number | null
  created_at: string
  created_by: string | null
  emailed_at: string | null
  emailed_to: string[] | null
  reminders?: { at: string; to: string[] }[]
}

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SavedDocuments({ refreshKey, onEdit, onCount }: { refreshKey: number; onEdit?: (doc: Doc) => void; onCount?: (n: number) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [filter, setFilter] = useState<'all' | Doc['kind'] | 'drafts'>('all')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  // "Send again" opens under the row: same PDF, any address, a short covering email
  const [resend, setResend] = useState<null | { id: string; reminder?: boolean; to: string; cc: string; subject: string; message: string; sending?: boolean; result?: { ok: boolean; text: string } }>(null)
  function startResend(d: Doc) {
    const what = d.kind === 'invoice' ? `invoice ${d.number}` : d.kind === 'receipt' ? `receipt ${d.number}` : `our letter, “${d.title}”`
    setResend({
      id: d.id, cc: '',
      to: (d.emailed_to?.join(', ') || d.recipient_email || ''),
      subject: d.kind === 'letter' ? d.title : d.kind === 'invoice' ? `Invoice ${d.number} from Capital Rooms` : `Receipt ${d.number} from Capital Rooms`,
      message: `Dear ${dearFromText(d.recipient_name)},\n\nPlease find attached ${what}.\n\nKind regards,`,
    })
  }
  // an invoice already emailed: a reminder — same PDF, worded as a reminder, and the first-sent date is kept
  function startReminder(d: Doc) {
    const n = (d.reminders?.length ?? 0) + 1
    setResend({
      id: d.id, reminder: true, cc: '',
      to: (d.emailed_to?.join(', ') || d.recipient_email || ''),
      subject: `${n > 1 ? 'Second reminder' : 'Reminder'}: invoice ${d.number} from Capital Rooms`,
      message: `Dear ${dearFromText(d.recipient_name)},\n\nThis is a friendly reminder that invoice ${d.number}${d.total != null ? ` for ${money(d.total)}` : ''}, sent on ${when(d.emailed_at!)}, is still showing as unpaid on our records. A copy is attached.\n\nIf you have already paid, thank you, and please ignore this email. Otherwise we would be grateful if you could arrange payment at your earliest convenience.\n\nKind regards,`,
    })
  }
  const resendDoc = resend ? (docs ?? []).find(x => x.id === resend.id) ?? null : null
  async function sendAgain() {
    if (!resend) return
    const split = (v: string) => v.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)
    setResend(r => r && { ...r, sending: true, result: undefined })
    const r = await adminFetch('/api/admin/document-generator/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resendId: resend.id, reminder: !!resend.reminder, to: split(resend.to), cc: split(resend.cc), subject: resend.subject, message: resend.message }) })
    const d = await r.json().catch(() => ({}))
    setResend(x => x && { ...x, sending: false, result: r.ok ? { ok: true, text: `${resend.reminder ? 'Reminder sent' : 'Sent'} to ${d.to.join(', ')}${d.cc?.length ? `, cc ${d.cc.join(', ')}` : ''}.` } : { ok: false, text: d.error ?? 'The email was not sent' } })
    if (r.ok) load()
  }

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/documents/generated')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load your documents'); setDocs([]); return }
    setDocs(d.documents ?? []); setSetupNeeded(!!d.setupNeeded); setError(''); onCount?.((d.documents ?? []).length)
  }, [onCount])
  useEffect(() => { load() }, [load, refreshKey])
  // a "More" menu closes when you click anywhere else
  useEffect(() => {
    const close = (e: MouseEvent) => document.querySelectorAll('details[data-more][open]').forEach(d => { if (!d.contains(e.target as Node)) (d as HTMLDetailsElement).open = false })
    document.addEventListener('click', close); return () => document.removeEventListener('click', close)
  }, [])

  async function open(doc: Doc, mode: 'view' | 'download') {
    const win = mode === 'view' ? window.open('', '_blank') : null   // open now, while the click still allows it
    setBusy(doc.id + mode)
    try {
      const r = await adminFetch(`/api/admin/documents/generated?id=${doc.id}&mode=${mode}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) throw new Error(d.error ?? 'Could not open it')
      if (win) win.location.href = d.url
      else { const a = document.createElement('a'); a.href = d.url; a.click() }
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : 'Could not open it')
    } finally { setBusy('') }
  }

  async function remove(doc: Doc) {
    const name = doc.kind === 'invoice' ? `invoice ${doc.number}` : doc.kind === 'receipt' ? `receipt ${doc.number}` : `letter “${doc.title}”`
    if (!window.confirm(`Delete ${name} to ${doc.recipient_name}? It disappears from this list; a copy is kept on record.`)) return
    setBusy(doc.id + 'delete')
    const r = await adminFetch(`/api/admin/documents/generated?id=${doc.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setError(d.error ?? 'Could not delete it'); return }
    setDocs(list => { const next = (list ?? []).filter(x => x.id !== doc.id); onCount?.(next.length); return next })
  }

  const q = query.trim().toLowerCase()
  const shown = (docs ?? []).filter(d => (filter === 'all' || (filter === 'drafts' ? !d.emailed_at : d.kind === filter)) &&
    (!q || [d.number, d.title, d.recipient_name].some(v => (v ?? '').toLowerCase().includes(q))))

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm mb-md">
        <h2 className="font-semibold text-neutral-900">Sent &amp; saved</h2>
        <div className="flex flex-wrap items-center gap-sm">
          <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50">
            {([['all', 'All'], ['invoice', 'Invoices'], ['letter', 'Letters'], ['receipt', 'Receipts'], ['drafts', `Not emailed${(docs ?? []).some(d => !d.emailed_at) ? ` (${(docs ?? []).filter(d => !d.emailed_at).length})` : ''}`]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFilter(v)}
                className={`rounded-md px-sm py-0.5 text-xs font-semibold ${filter === v ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button>
            ))}
          </div>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search number, name or subject"
            className="rounded-lg border border-neutral-200 px-sm py-1 text-sm w-56" />
        </div>
      </div>

      {setupNeeded && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-md py-sm mb-md">Saving documents needs migration 197 running in Supabase.</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-md py-sm mb-md">{error}</p>}
      {docs === null && <p className="text-sm text-neutral-400">Loading…</p>}
      {docs !== null && !shown.length && !setupNeeded && (
        <p className="text-sm text-neutral-500">{docs.length ? 'Nothing matches.' : 'Nothing yet — every letter or invoice you save, download or email lands here.'}</p>
      )}

      {resend && resendDoc && (
        <div id="send-again" className="mb-md rounded-xl border border-neutral-300 bg-neutral-50 p-md">
          <div className="mb-xs flex items-start justify-between gap-sm">
            <p className="text-sm font-bold text-neutral-900">{resend.reminder ? 'Send a reminder' : 'Send again'}: {resendDoc.kind === 'letter' ? resendDoc.title : `${resendDoc.kind === 'invoice' ? 'Invoice' : 'Receipt'} ${resendDoc.number}`} <span className="font-normal text-neutral-500">— {resendDoc.recipient_name}</span></p>
            <button type="button" onClick={() => setResend(null)} className="text-xs font-semibold text-neutral-600 underline">Close</button>
          </div>

                    <p className="mb-sm text-xs text-neutral-600">Sends the saved PDF exactly as it is. To change the {resendDoc.kind === 'invoice' ? 'invoice' : 'letter'} first, use <b>Edit</b>.</p>
                    <div className="grid gap-sm sm:grid-cols-2">
                      <label className="text-xs font-semibold text-neutral-700">To<input className="mt-0.5 w-full rounded-lg border border-neutral-300 bg-white px-sm py-1.5 text-sm font-normal" value={resend.to} onChange={e => setResend({ ...resend, to: e.target.value })} placeholder="name@example.com" /></label>
                      <label className="text-xs font-semibold text-neutral-700">Cc<input className="mt-0.5 w-full rounded-lg border border-neutral-300 bg-white px-sm py-1.5 text-sm font-normal" value={resend.cc} onChange={e => setResend({ ...resend, cc: e.target.value })} placeholder="optional" /></label>
                      <label className="text-xs font-semibold text-neutral-700 sm:col-span-2">Subject<input className="mt-0.5 w-full rounded-lg border border-neutral-300 bg-white px-sm py-1.5 text-sm font-normal" value={resend.subject} onChange={e => setResend({ ...resend, subject: e.target.value })} /></label>
                      <label className="text-xs font-semibold text-neutral-700 sm:col-span-2">Email message<textarea rows={5} className="mt-0.5 w-full rounded-lg border border-neutral-300 bg-white px-sm py-1.5 text-sm font-normal" value={resend.message} onChange={e => setResend({ ...resend, message: e.target.value })} /></label>
                    </div>
                    <div className="mt-sm flex flex-wrap items-center gap-sm">
                      <button type="button" onClick={sendAgain} disabled={resend.sending || !resend.to.trim()} className="rounded-lg bg-neutral-900 px-lg py-1.5 text-sm font-bold text-white disabled:bg-neutral-300">{resend.sending ? 'Sending…' : 'Send'}</button>
                      {resend.result && <span className={`text-sm ${resend.result.ok ? 'text-emerald-700' : 'text-red-700'}`}>{resend.result.text}</span>}
                    </div>
                          </div>
      )}

      {shown.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {shown.map(d => {
            const scrollTo = () => setTimeout(() => document.getElementById('send-again')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
            const remind = d.kind === 'invoice' && !!d.emailed_at
            const name = d.kind === 'letter' ? d.title : `${d.kind === 'invoice' ? 'Invoice' : 'Receipt'} ${d.number}`
            const last = d.reminders?.length ? d.reminders[d.reminders.length - 1] : null
            const status = !d.emailed_at ? <span className="rounded-full bg-neutral-100 px-sm py-0.5 text-xs font-semibold text-neutral-600">Not emailed</span>
              : last ? <span className="rounded-full bg-amber-50 px-sm py-0.5 text-xs font-semibold text-amber-800">{d.reminders!.length === 1 ? 'Reminded' : `Reminded ${d.reminders!.length}×`} {when(last.at)}</span>
              : <span className="rounded-full bg-emerald-50 px-sm py-0.5 text-xs font-semibold text-emerald-800">Emailed {when(d.emailed_at)}</span>
            const primary = remind
              ? <button type="button" onClick={() => { if (resend?.id === d.id && resend.reminder) { setResend(null); return } startReminder(d); scrollTo() }} disabled={!!busy} className="w-32 rounded-lg border border-amber-300 bg-amber-50 px-md py-1 text-center text-xs font-bold text-amber-900 hover:bg-amber-100">{resend?.id === d.id && resend.reminder ? 'Close' : 'Send reminder'}</button>
              : <button type="button" onClick={() => { if (resend?.id === d.id && !resend.reminder) { setResend(null); return } startResend(d); scrollTo() }} disabled={!!busy} className="w-32 rounded-lg border border-neutral-300 px-md py-1 text-center text-xs font-bold text-neutral-900 hover:bg-neutral-50">{resend?.id === d.id && !resend.reminder ? 'Close' : d.emailed_at ? 'Send again' : 'Email it'}</button>
            const item = 'block w-full px-md py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-50 disabled:text-neutral-300'
            return (
              <li key={d.id} className="grid gap-x-md gap-y-xs py-sm md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-sm gap-y-0.5">
                    <span className="font-semibold text-neutral-900">{name}</span>
                    {d.total != null && <span className="text-sm font-semibold tabular-nums text-neutral-700">{money(Number(d.total))}</span>}
                    {status}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{d.recipient_name}{d.kind !== 'letter' && d.title ? ` · ${d.title}` : ''} · made {when(d.created_at)}{d.emailed_to?.length ? ` · to ${d.emailed_to.join(', ')}` : ''}</p>
                </div>
                <div className="flex items-center gap-sm">
                  <button type="button" onClick={() => open(d, 'view')} disabled={!!busy} className="text-xs font-semibold text-blue-700 hover:underline">View</button>
                  {primary}
                  <details className="relative" data-more>
                    <summary className="cursor-pointer list-none rounded-lg px-sm py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 [&::-webkit-details-marker]:hidden" aria-label="More actions">More ▾</summary>
                    <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg" onClick={e => (e.currentTarget.parentElement as HTMLDetailsElement).open = false}>
                      <button type="button" className={item} disabled={!!busy} onClick={() => open(d, 'download')}>Download PDF</button>
                      {remind && <button type="button" className={item} disabled={!!busy} onClick={() => { startResend(d); scrollTo() }}>Send again (not a reminder)</button>}
                      {onEdit && d.kind !== 'receipt' && <button type="button" className={item} disabled={!!busy} onClick={() => onEdit(d)}>Edit</button>}
                      <button type="button" className={`${item} text-red-700`} disabled={!!busy} onClick={() => remove(d)}>Delete</button>
                    </div>
                  </details>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
