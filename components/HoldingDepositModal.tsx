'use client'

// "Holding deposit received": writes the official numbered record (HOLD…) — amount, the date it actually arrived,
// how it was paid and the payer's reference — and files a receipt in Letters & Invoices. Nothing is sent unless you
// tick it: the receipt to the applicant, the landlord email and the housemate intro are all off to start with.
// Drafts and records come from /api/lettings/holding-deposit.

import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Props {
  applicantId: string
  onClose: () => void
  onDone: (summary: string, tenancyId?: string) => void
}

interface HoldRecord {
  id: string; hold_no: string; amount: number; received_on: string; method: string; payer_name: string
  payer_reference: string | null; apply_to: 'deposit' | 'first_rent'; status: string; outcome_on: string | null
  outcome_reason: string | null; receipt_document_id: string | null; receipt_emailed_at: string | null
  receipt_emailed_to: string[] | null; recorded_by: string; recorded_at: string
}

interface Draft {
  applicant: { name: string; room: string; property: string }
  alreadyPaid: boolean
  amount: number | null
  email: string | null
  records: HoldRecord[]
  setupNeeded: boolean
  landlord: { name: string; to: string[]; subject: string; message: string } | null
  housemates: { count: number; title: string; message: string }
}

const METHODS: [string, string][] = [['bank_transfer', 'Bank transfer'], ['card', 'Card'], ['cash', 'Cash'], ['other', 'Other']]
const OUTCOMES: [string, string, string][] = [
  ['reversed', 'Reverse — recorded in error', 'What was wrong (e.g. amount typed as £150, was £160)'],
  ['refunded', 'Refunded', 'Why, and how it was paid back'],
  ['retained', 'Retained', 'The reason under the Tenant Fees Act (e.g. withdrew, failed Right to Rent)'],
]
const STATUS: Record<string, string> = { held: 'Held', applied: 'Applied', refunded: 'Refunded', retained: 'Retained', reversed: 'Reversed' }
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function HoldingDepositModal({ applicantId, onClose, onDone }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({ amount: '', receivedOn: today(), method: 'bank_transfer', payerName: '', payerReference: '', applyTo: 'deposit', notes: '' })
  const [receipt, setReceipt] = useState({ send: false, to: '' })
  const [landlord, setLandlord] = useState({ send: false, to: '', subject: '', message: '' })
  const [housemates, setHousemates] = useState({ send: false, title: '', message: '' })
  const [outcome, setOutcome] = useState<{ status: string; outcomeOn: string; reason: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const res = await adminFetch('/api/lettings/holding-deposit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantId, action: 'draft' }),
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    if (!res?.ok || !d) { setLoadError(d?.error ?? 'Could not prepare the holding deposit'); return null }
    setDraft(d)
    return d as Draft
  }

  useEffect(() => {
    let live = true
    load().then(d => {
      if (!live || !d) return
      setForm(f => ({ ...f, amount: d.amount ? d.amount.toFixed(2) : '', payerName: d.applicant.name ?? '' }))
      setReceipt({ send: false, to: d.email ?? '' })
      setLandlord({ send: false, to: (d.landlord?.to ?? []).join(', '), subject: d.landlord?.subject ?? '', message: d.landlord?.message ?? '' })
      setHousemates({ send: false, title: d.housemates.title, message: d.housemates.message })
    })
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicantId])

  const current = draft?.records.find(r => r.status === 'held' || r.status === 'applied') ?? null
  const anySend = receipt.send || landlord.send || housemates.send

  async function submit() {
    setSending(true); setError('')
    try {
      const res = await adminFetch('/api/lettings/holding-deposit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId, action: 'send', holdingId: current?.id, ...form, receipt, landlord, housemates }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Could not record the holding deposit')
      const parts = [d.recorded ? `✅ Holding deposit ${d.holdNo} recorded — receipt filed in Letters & Invoices` : `✅ ${d.holdNo}`]
      if (d.receipt) parts.push(`receipt emailed to ${d.receipt}`)
      if (d.landlord) parts.push(`landlord emailed (${d.landlord})`)
      if (d.housemates) parts.push(`${d.housemates} told`)
      onDone(`${parts.join(' · ')}${d.errors?.length ? ` · ⚠️ ${d.errors.join('; ')}` : ''}`, d.recorded ? d.tenancyId : undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the holding deposit')
    } finally {
      setSending(false)
    }
  }

  async function saveOutcome(rec: HoldRecord) {
    if (!outcome) return
    setSending(true); setError('')
    const res = await adminFetch('/api/lettings/holding-deposit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantId, action: 'outcome', holdingId: rec.id, ...outcome }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setSending(false); setError(d.error ?? 'Could not save that'); return }
    await load()   // keeps "Saving…" showing until the record reads back with its new status
    setOutcome(null)
    setSending(false)
  }

  async function viewReceipt(docId: string) {
    const win = window.open('', '_blank')
    const r = await adminFetch(`/api/admin/documents/generated?id=${docId}&mode=view`)
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.url && win) win.location.href = d.url
    else { win?.close(); setError(d.error ?? 'Could not open the receipt') }
  }

  const field = 'w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 bg-white'
  const lbl = 'block text-xs font-bold uppercase tracking-wide text-neutral-600 mb-xs'
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => !sending && onClose()}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-lg shadow-2xl max-h-[92vh] overflow-y-auto text-neutral-900" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-md mb-md">
          <div>
            <h2 className="text-xl font-bold">💷 Holding deposit received</h2>
            {draft && <p className="text-sm text-neutral-600">{draft.applicant.name} · {draft.applicant.room}, {draft.applicant.property}</p>}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
        </div>

        {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{loadError}</div>}
        {!draft && !loadError && <p className="py-xl text-center text-sm text-neutral-500">Loading…</p>}

        {draft && (
          <div className="space-y-lg">
            {draft.setupNeeded && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">
                Recording holding deposits needs migration 198 running in Supabase first.
              </div>
            )}
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{error}</div>}

            {draft.records.length > 0 && (
              <section className="rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                {draft.records.map(r => (
                  <div key={r.id} className="p-md text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-sm">
                      <p className="font-bold">{r.hold_no} · {gbp(r.amount)} <span className="font-normal text-neutral-600">received {day(r.received_on)}</span></p>
                      <span className={`rounded-full px-sm py-0.5 text-xs font-semibold ${r.status === 'held' ? 'bg-green-50 text-green-800' : r.status === 'reversed' ? 'bg-neutral-100 text-neutral-500 line-through' : 'bg-blue-50 text-blue-800'}`}>{STATUS[r.status] ?? r.status}</span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-xs">
                      {METHODS.find(m => m[0] === r.method)?.[1]}{r.payer_reference ? ` · ref ${r.payer_reference}` : ''} · from {r.payer_name} · towards the {r.apply_to === 'first_rent' ? 'first rent' : 'deposit'} · recorded by {r.recorded_by} {day(r.recorded_at)}
                      {r.receipt_emailed_at ? ` · receipt emailed ${day(r.receipt_emailed_at)}` : ''}
                    </p>
                    {r.outcome_reason && <p className="text-xs text-neutral-600 mt-xs">{STATUS[r.status]} {r.outcome_on ? day(r.outcome_on) : ''}: {r.outcome_reason}</p>}
                    <div className="flex flex-wrap gap-md mt-sm">
                      {r.receipt_document_id && <button type="button" onClick={() => viewReceipt(r.receipt_document_id!)} className="text-xs font-semibold text-blue-600 hover:underline">View receipt</button>}
                      {r.status === 'held' && !outcome && <button type="button" onClick={() => setOutcome({ status: 'reversed', outcomeOn: today(), reason: '' })} className="text-xs font-semibold text-neutral-600 hover:underline">Reverse, refund or retain…</button>}
                    </div>
                    {r.status === 'held' && outcome && (
                      <div className="mt-sm rounded-lg bg-neutral-50 p-sm space-y-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                          <select className={field} value={outcome.status} onChange={e => setOutcome(o => o && { ...o, status: e.target.value })}>
                            {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <input type="date" className={field} value={outcome.outcomeOn} max={today()} onChange={e => setOutcome(o => o && { ...o, outcomeOn: e.target.value })} />
                        </div>
                        <input className={field} placeholder={OUTCOMES.find(o => o[0] === outcome.status)?.[2]} value={outcome.reason} onChange={e => setOutcome(o => o && { ...o, reason: e.target.value })} />
                        <p className="text-[11px] text-neutral-500">This is final — the record and the reason are kept. To correct a mistake, reverse it and record it again.</p>
                        <div className="flex gap-sm">
                          <button type="button" onClick={() => setOutcome(null)} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-semibold">Cancel</button>
                          <button type="button" disabled={sending || !outcome.reason.trim()} onClick={() => saveOutcome(r)} className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-bold text-white disabled:opacity-40">{sending ? 'Saving…' : 'Save'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {!current && !draft.setupNeeded && (
              <section className="space-y-md">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                  <div><label className={lbl}>Amount received (£)</label><input inputMode="decimal" className={field} value={form.amount} onChange={set('amount')} /></div>
                  <div><label className={lbl}>Date it reached us</label><input type="date" className={field} value={form.receivedOn} max={today()} onChange={set('receivedOn')} /></div>
                  <div><label className={lbl}>Paid by</label>
                    <select className={field} value={form.method} onChange={set('method')}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label className={lbl}>Payment reference</label><input className={field} value={form.payerReference} onChange={set('payerReference')} placeholder="As shown on the bank statement" /></div>
                  <div><label className={lbl}>Received from</label><input className={field} value={form.payerName} onChange={set('payerName')} /></div>
                  <div><label className={lbl}>Put it towards</label>
                    <select className={field} value={form.applyTo} onChange={set('applyTo')}>
                      <option value="deposit">The tenancy deposit</option>
                      <option value="first_rent">The first month’s rent</option>
                    </select></div>
                </div>
                <div><label className={lbl}>Notes (optional)</label><input className={field} value={form.notes} onChange={set('notes')} /></div>
                <p className="text-[11px] text-neutral-500">Once recorded it gets a HOLD number and can’t be edited or deleted — a mistake is put right by reversing it. A receipt is filed in Letters &amp; Invoices.</p>
              </section>
            )}

            <section className="rounded-xl border border-neutral-200 p-md space-y-sm">
              <label className="flex items-center gap-sm font-semibold">
                <input type="checkbox" checked={receipt.send} onChange={e => setReceipt(r => ({ ...r, send: e.target.checked }))} />
                Email the receipt to the applicant
              </label>
              {receipt.send && <div><label className={lbl}>To</label><input className={field} value={receipt.to} onChange={e => setReceipt(r => ({ ...r, to: e.target.value }))} /></div>}
            </section>

            <section className="rounded-xl border border-neutral-200 p-md space-y-sm">
              <label className="flex items-center gap-sm font-semibold">
                <input type="checkbox" checked={landlord.send} disabled={!draft.landlord}
                  onChange={e => setLandlord(l => ({ ...l, send: e.target.checked }))} />
                Email the landlord{draft.landlord?.name ? ` — ${draft.landlord.name}` : ''}
              </label>
              {!draft.landlord && <p className="text-sm text-amber-700">No landlord is linked to this property, so there is no one to email.</p>}
              {draft.landlord && landlord.send && (
                <>
                  <div><label className={lbl}>To</label><input className={field} value={landlord.to} onChange={e => setLandlord(l => ({ ...l, to: e.target.value }))} /></div>
                  <div><label className={lbl}>Subject</label><input className={field} value={landlord.subject} onChange={e => setLandlord(l => ({ ...l, subject: e.target.value }))} /></div>
                  <div><label className={lbl}>Letter</label><textarea rows={14} className={field} value={landlord.message} onChange={e => setLandlord(l => ({ ...l, message: e.target.value }))} /></div>
                  <p className="text-[11px] text-neutral-500">Sent from you, with your email signature added underneath.</p>
                </>
              )}
            </section>

            <section className="rounded-xl border border-neutral-200 p-md space-y-sm">
              <label className="flex items-center gap-sm font-semibold">
                <input type="checkbox" checked={housemates.send} disabled={draft.housemates.count === 0}
                  onChange={e => setHousemates(h => ({ ...h, send: e.target.checked }))} />
                Tell the housemates — {draft.housemates.count ? `${draft.housemates.count} current tenant${draft.housemates.count === 1 ? '' : 's'}` : 'no current tenants'}
              </label>
              {housemates.send && draft.housemates.count > 0 && (
                <>
                  <div><label className={lbl}>Title</label><input className={field} value={housemates.title} onChange={e => setHousemates(h => ({ ...h, title: e.target.value }))} /></div>
                  <div><label className={lbl}>Message</label><textarea rows={5} className={field} value={housemates.message} onChange={e => setHousemates(h => ({ ...h, message: e.target.value }))} /></div>
                  <p className="text-[11px] text-neutral-500">Goes to their app (with a push) and by email, unless tenant messages are paused. First name, work and interests only — check nothing personal or financial slipped in.</p>
                </>
              )}
            </section>

            {!current && <p className="text-xs text-neutral-500">Nothing is emailed unless ticked above. Recording it agrees the let: the incoming tenancy is created and its letting file opens. You and the lettings team get an in-app confirmation.</p>}

            <div className="flex gap-md">
              <button onClick={onClose} disabled={sending} className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50">{current ? 'Close' : 'Cancel'}</button>
              <button onClick={submit} disabled={sending || draft.setupNeeded || (!!current && !anySend)}
                className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40">
                {sending ? 'Saving…' : current ? 'Send what’s ticked' : anySend ? 'Record & send what’s ticked' : 'Record holding deposit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
