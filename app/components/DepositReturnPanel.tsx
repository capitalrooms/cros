'use client'
// End-of-tenancy deposit return (migration 195): deductions with reasons, what goes to the landlord and the tenant,
// agreed or disputed (with the scheme's dispute reference), and the date it was returned. Numbered DEPR.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
type Line = { description: string; amount: string; evidence: string }

export default function DepositReturnPanel({ tenancyId }: { tenancyId: string }) {
  const [open, setOpen] = useState(false)
  const [deposit, setDeposit] = useState<number | null>(null)
  const [existing, setExisting] = useState<any>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [status, setStatus] = useState('proposed')
  const [disputeRef, setDisputeRef] = useState('')
  const [returnedOn, setReturnedOn] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    adminFetch(`/api/admin/deposit-returns?tenancyId=${tenancyId}`).then(r => r.json()).then(j => {
      setDeposit(Number(j.tenancy?.deposit_amount || 0))
      const d = j.depositReturn
      setExisting(d)
      if (d) {
        setLines((d.deductions ?? []).map((x: any) => ({ description: x.description, amount: String(x.amount), evidence: x.evidence ?? '' })))
        setStatus(d.status); setDisputeRef(d.dispute_ref ?? ''); setReturnedOn(d.returned_on ?? ''); setNotes(d.notes ?? '')
      }
    })
  }, [open, tenancyId])

  const deductions = Math.round(lines.reduce((t, l) => t + (Number(l.amount) || 0), 0) * 100) / 100
  const locked = existing?.status === 'returned'
  async function save() {
    setBusy(true); setMsg(null)
    const r = await adminFetch('/api/admin/deposit-returns', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenancyId, deductions: lines.filter(l => l.description || l.amount), status, disputeRef, returnedOn, notes }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg({ ok: r.ok, text: r.ok ? j.message : j.error || 'Could not save' })
    if (r.ok) setExisting({ ...(existing ?? {}), status, txn_no: j.number })
  }
  const input = 'rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'

  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-md py-sm text-left">
        <span className="text-sm font-semibold text-neutral-900">Deposit return {existing?.txn_no ? <span className="ml-sm font-mono text-xs text-neutral-500">{existing.txn_no} · {existing.status}</span> : null}</span>
        <span className="text-xs text-neutral-500">{open ? 'Hide' : 'Open'}</span>
      </button>
      {open && deposit != null && (
        <div className="space-y-sm border-t border-neutral-100 px-md py-md">
          {!deposit ? <p className="text-sm text-neutral-500">No deposit recorded on this tenancy.</p> : (
            <>
              <p className="text-xs text-neutral-500">Deposit {gbp(deposit)}. List any deductions with the reason and evidence (check-out report, invoice, photos). Anything not deducted goes back to the tenant.</p>
              {lines.map((l, i) => (
                <div key={i} className="flex flex-wrap gap-sm">
                  <input disabled={locked} value={l.description} onChange={e => setLines(lines.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} placeholder="Reason, e.g. Professional clean" className={`${input} flex-1 min-w-[180px]`} />
                  <input disabled={locked} value={l.amount} onChange={e => setLines(lines.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} placeholder="£" inputMode="decimal" className={`${input} w-24`} />
                  <input disabled={locked} value={l.evidence} onChange={e => setLines(lines.map((x, k) => (k === i ? { ...x, evidence: e.target.value } : x)))} placeholder="Evidence" className={`${input} w-40`} />
                  {!locked && <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="text-xs text-neutral-400">Remove</button>}
                </div>
              ))}
              {!locked && <button type="button" onClick={() => setLines([...lines, { description: '', amount: '', evidence: '' }])} className="text-xs font-semibold text-neutral-700 underline">+ Add a deduction</button>}
              <div className="flex flex-wrap gap-lg rounded-lg bg-neutral-50 px-md py-sm text-sm">
                <span>To the landlord <strong className="tabular-nums">{gbp(deductions)}</strong></span>
                <span>Back to the tenant <strong className={`tabular-nums ${deductions > deposit ? 'text-red-700' : ''}`}>{gbp(deposit - deductions)}</strong></span>
              </div>
              <div className="flex flex-wrap items-end gap-sm">
                <label className="text-xs text-neutral-600">Status
                  <select disabled={locked} value={status} onChange={e => setStatus(e.target.value)} className={`${input} ml-xs`}>
                    <option value="proposed">Proposed to the tenant</option><option value="agreed">Agreed</option><option value="disputed">Disputed (scheme)</option><option value="returned">Returned</option>
                  </select></label>
                {status === 'disputed' && <input disabled={locked} value={disputeRef} onChange={e => setDisputeRef(e.target.value)} placeholder="Scheme dispute reference" className={input} />}
                {status === 'returned' && <label className="text-xs text-neutral-600">Returned on <input disabled={locked} type="date" value={returnedOn} onChange={e => setReturnedOn(e.target.value)} className={`${input} ml-xs`} /></label>}
              </div>
              <input disabled={locked} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (office only)" className={`${input} w-full`} />
              {msg && <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
              {locked ? <p className="text-xs text-neutral-500">Returned — kept on record and can’t be changed.</p>
                : <button type="button" disabled={busy || deductions > deposit} onClick={save} className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white disabled:bg-neutral-300">{busy ? 'Saving…' : 'Save deposit return'}</button>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
