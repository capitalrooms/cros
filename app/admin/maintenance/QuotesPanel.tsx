'use client'

// Quotes for one maintenance job: ask several contractors (on the app or not), compare what comes back,
// type in prices given by phone, and accept one — which assigns the job and declines the rest.
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Quote {
  id: string; contractor_id: string | null; contractor_name: string; contractor_email: string | null; contractor_phone: string | null
  channel: 'app' | 'email'; status: 'requested' | 'submitted' | 'accepted' | 'declined' | 'withdrawn'
  amount: number | null; notes: string | null; site_visit: boolean; visit_date: string | null; entered_by_staff: boolean
  requested_at: string; sent_at: string | null; submitted_at: string | null
}
interface Contractor { id: string; label: string; email: string }
interface Other { name: string; email: string; phone: string }

const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const STATUS: Record<Quote['status'], [string, string]> = {
  requested: ['Waiting', 'bg-neutral-100 text-neutral-600'],
  submitted: ['Price in', 'bg-blue-50 text-blue-700'],
  accepted: ['Accepted', 'bg-green-50 text-green-700'],
  declined: ['Declined', 'bg-neutral-100 text-neutral-400'],
  withdrawn: ['Withdrawn', 'bg-neutral-100 text-neutral-400'],
}

export default function QuotesPanel({ ticketId, contractors, onAssigned }: { ticketId: string; contractors: Contractor[]; onAssigned: () => void }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [asking, setAsking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [others, setOthers] = useState<Other[]>([])
  const [message, setMessage] = useState('')
  const [entering, setEntering] = useState<string | null>(null)
  const [entry, setEntry] = useState({ amount: '', notes: '', site_visit: false, visit_date: '' })

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/quotes?ticketId=${ticketId}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not load quotes')
      setQuotes(d.quotes); setError('')
    } catch (e) { setQuotes([]); setError(e instanceof Error ? e.message : 'Could not load quotes') }
  }, [ticketId])
  useEffect(() => { load() }, [load])

  const open = (quotes ?? []).filter(q => q.status === 'requested' || q.status === 'submitted')
  const accepted = (quotes ?? []).find(q => q.status === 'accepted')
  const askedIds = new Set(open.map(q => q.contractor_id).filter(Boolean))
  const prices = open.filter(q => q.amount != null).map(q => Number(q.amount))
  const lowest = prices.length > 1 ? Math.min(...prices) : null

  async function send() {
    setBusy('send'); setError(''); setNotice('')
    try {
      const res = await adminFetch('/api/admin/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, contractorIds: [...picked], others: others.filter(o => o.name || o.email), message }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not send the requests')
      const failed = (d.sent ?? []).filter((r: any) => !r.ok)
      setNotice(failed.length
        ? `Saved, but the email to ${failed.map((f: any) => f.name).join(', ')} failed — use Resend.`
        : `Quote request sent to ${(d.sent ?? []).length} contractor${(d.sent ?? []).length === 1 ? '' : 's'}.`)
      setAsking(false); setPicked(new Set()); setOthers([]); setMessage('')
      load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send the requests') }
    finally { setBusy('') }
  }

  async function preview() {
    setBusy('preview'); setError('')
    const win = window.open('', '_blank')
    try {
      const name = contractors.find(c => picked.has(c.id))?.label || others.find(o => o.name)?.name || 'Contractor'
      const res = await adminFetch('/api/admin/quotes/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, contractorName: name, message, offApp: !picked.size && others.length > 0 }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not build the PDF')
      const url = URL.createObjectURL(await res.blob())
      if (win) win.location.href = url; else window.open(url, '_blank')
    } catch (e) { win?.close(); setError(e instanceof Error ? e.message : 'Could not build the PDF') }
    finally { setBusy('') }
  }

  // when accepting, thank the other contractors (on by default; never names the winner or price)
  const [thankOthers, setThankOthers] = useState(true)

  async function act(q: Quote, action: string, extra: Record<string, unknown> = {}) {
    if (action === 'accept' && !window.confirm(`Accept ${q.contractor_name}'s quote of ${gbp(Number(q.amount))}? The job is assigned to them and the other quotes are declined.`)) return
    setBusy(q.id + action); setError(''); setNotice('')
    try {
      const res = await adminFetch(`/api/admin/quotes/${q.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra, ...(action === 'accept' ? { thank_others: thankOthers } : {}) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not update the quote')
      if (action === 'accept') {
        setNotice(`${q.contractor_name} is now on this job${d.emailed ? ' and has been emailed' : ''}. The other contractors were marked declined${d.thanked ? ` and ${d.thanked} thanked by email` : ''}.`)
        onAssigned()
      }
      if (action === 'resend') setNotice(`Resent to ${q.contractor_name}.`)
      setEntering(null)
      load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update the quote') }
    finally { setBusy('') }
  }

  const input = 'w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'

  return (
    <div className="rounded-xl border-2 border-neutral-900 p-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h3 className="font-bold text-neutral-900">Quotes</h3>
          <p className="mt-xs text-xs text-neutral-500">Ask one or more contractors to price it first — on the app or not. Contractors not on the app get a PDF with the details, notes and photos, and a link to send their price.</p>
        </div>
        {!asking && !accepted && (
          <button onClick={() => setAsking(true)} className="shrink-0 rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white">Ask for quotes</button>
        )}
      </div>

      {error && <p className="mt-md rounded-lg bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-md rounded-lg bg-green-50 px-md py-sm text-sm text-green-800">{notice}</p>}

      {quotes && quotes.length > 0 && (
        <ul className="mt-md divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {quotes.map(q => {
            const [label, tone] = STATUS[q.status]
            const isLow = lowest != null && q.amount != null && Number(q.amount) === lowest
            return (
              <li key={q.id} className="p-md">
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                      {q.contractor_name}
                      <span className="ml-sm rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-500">{q.channel === 'app' ? 'App' : 'Email'}</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      Asked {day(q.requested_at)}{q.sent_at ? '' : ' · email not sent'}
                      {q.submitted_at ? ` · replied ${day(q.submitted_at)}${q.entered_by_staff ? ' (entered by office)' : ''}` : ''}
                    </p>
                    {q.notes && <p className="mt-xs text-xs text-neutral-700 whitespace-pre-line">{q.notes}</p>}
                    {q.site_visit && <p className="mt-xs text-xs font-semibold text-amber-700">Wants to visit first{q.visit_date ? ` · ${day(q.visit_date)}` : ''}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    {q.amount != null && <p className={`text-base font-bold tabular-nums ${isLow ? 'text-green-700' : 'text-neutral-900'}`}>{gbp(Number(q.amount))}</p>}
                    {isLow && <p className="text-[10px] font-bold uppercase text-green-700">Lowest</p>}
                    <span className={`mt-xs inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${tone}`}>{label}</span>
                  </div>
                </div>

                {(q.status === 'requested' || q.status === 'submitted') && entering !== q.id && (
                  <div className="mt-sm flex flex-wrap gap-sm">
                    {q.amount != null && (
                      <>
                        <button disabled={!!busy} onClick={() => act(q, 'accept')} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-40">
                          {busy === q.id + 'accept' ? 'Accepting…' : 'Accept & assign'}
                        </button>
                        {(quotes ?? []).filter(x => x.id !== q.id && (x.status === 'requested' || x.status === 'submitted')).length > 0 && (
                          <label className="flex items-center gap-xs text-[11px] text-neutral-600"><input type="checkbox" checked={thankOthers} onChange={e => setThankOthers(e.target.checked)} /> Thank the other contractors</label>
                        )}
                      </>
                    )}
                    <button disabled={!!busy} onClick={() => { setEntering(q.id); setEntry({ amount: q.amount != null ? String(q.amount) : '', notes: q.notes || '', site_visit: q.site_visit, visit_date: q.visit_date || '' }) }}
                      className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold text-neutral-800">{q.amount != null ? 'Edit price' : 'Enter price'}</button>
                    {q.status === 'requested' && q.contractor_email && (
                      <button disabled={!!busy} onClick={() => act(q, 'resend')} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold text-neutral-800">{busy === q.id + 'resend' ? 'Sending…' : 'Resend'}</button>
                    )}
                    <button disabled={!!busy} onClick={() => act(q, q.status === 'submitted' ? 'decline' : 'withdraw')} className="rounded-lg px-md py-xs text-xs font-bold text-neutral-500 hover:text-red-700">
                      {q.status === 'submitted' ? 'Decline' : 'Withdraw'}
                    </button>
                  </div>
                )}

                {entering === q.id && (
                  <div className="mt-sm grid gap-sm rounded-lg bg-neutral-50 p-sm">
                    <p className="text-xs text-neutral-500">Price given by phone or email — type it in so it can be compared and accepted.</p>
                    <div className="grid grid-cols-2 gap-sm">
                      <input className={input} inputMode="decimal" placeholder="Price £" value={entry.amount} onChange={e => setEntry({ ...entry, amount: e.target.value })} />
                      <label className="flex items-center gap-sm text-xs text-neutral-700"><input type="checkbox" checked={entry.site_visit} onChange={e => setEntry({ ...entry, site_visit: e.target.checked })} />Visit first</label>
                    </div>
                    {entry.site_visit && <input type="date" className={input} value={entry.visit_date} onChange={e => setEntry({ ...entry, visit_date: e.target.value })} />}
                    <textarea className={input} rows={2} placeholder="Notes (what's included)" value={entry.notes} onChange={e => setEntry({ ...entry, notes: e.target.value })} />
                    <div className="flex gap-sm">
                      <button disabled={!!busy} onClick={() => act(q, 'enter', { ...entry, amount: entry.amount.replace(/[£,\s]/g, '') })} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-40">Save price</button>
                      <button onClick={() => setEntering(null)} className="rounded-lg px-md py-xs text-xs font-bold text-neutral-500">Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {asking && (
        <div className="mt-md space-y-md">
          <div>
            <p className="text-xs font-semibold text-neutral-700">Contractors on the app</p>
            <div className="mt-xs grid gap-xs sm:grid-cols-2">
              {contractors.length === 0 && <p className="text-xs text-neutral-500">No contractors on the app yet.</p>}
              {contractors.map(c => {
                const already = askedIds.has(c.id)
                return (
                  <label key={c.id} className={`flex items-center gap-sm rounded-lg border px-md py-sm text-sm ${already ? 'border-neutral-100 text-neutral-400' : 'border-neutral-200 text-neutral-900'}`}>
                    <input type="checkbox" disabled={already} checked={picked.has(c.id)}
                      onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n })} />
                    <span className="truncate">{c.label}{already ? ' · already asked' : ''}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-neutral-700">Contractors not on the app</p>
            <div className="mt-xs space-y-xs">
              {others.map((o, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-xs sm:grid-cols-[1fr_1.2fr_0.8fr_auto]">
                  <input className={input} placeholder="Name or company" value={o.name} onChange={e => setOthers(l => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <input className={input} type="email" placeholder="Email" value={o.email} onChange={e => setOthers(l => l.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                  <input className={`${input} hidden sm:block`} placeholder="Phone (optional)" value={o.phone} onChange={e => setOthers(l => l.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />
                  <button onClick={() => setOthers(l => l.filter((_, j) => j !== i))} className="px-sm text-neutral-400 hover:text-red-600" aria-label="Remove">✕</button>
                </div>
              ))}
              <button onClick={() => setOthers(l => [...l, { name: '', email: '', phone: '' }])} className="text-xs font-bold text-neutral-700 underline">+ Add a contractor by email</button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700">Note to the contractors <span className="font-normal text-neutral-500">(optional — goes in the email and PDF)</span></label>
            <textarea className={`${input} mt-xs`} rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. Please include parts. Tenant is home most mornings." />
          </div>

          <p className="text-xs text-neutral-500">The PDF includes the job, the tenant&apos;s description, notes and photos. It never includes tenant names, phone numbers or the key safe code.</p>

          <div className="flex flex-wrap gap-sm">
            <button disabled={!!busy || (!picked.size && !others.length)} onClick={send} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">
              {busy === 'send' ? 'Sending…' : `Send quote request${picked.size + others.length > 1 ? 's' : ''}`}
            </button>
            <button disabled={!!busy} onClick={preview} className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-bold text-neutral-800">
              {busy === 'preview' ? 'Building…' : 'Preview PDF'}
            </button>
            <button onClick={() => setAsking(false)} className="rounded-lg px-md py-sm text-sm font-bold text-neutral-500">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
