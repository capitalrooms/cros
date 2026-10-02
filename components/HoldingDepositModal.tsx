'use client'

// "Holding deposit received": records it, then — after you've checked the drafts — emails the landlord that we've
// secured an applicant (with a short bio) and tells the current housemates someone new is on the way.
// Drafts come from /api/lettings/holding-deposit; nothing is sent until you press the button.

import { useEffect, useState } from 'react'

interface Props {
  applicantId: string
  onClose: () => void
  onDone: (summary: string) => void
}

interface Draft {
  applicant: { name: string; room: string; property: string }
  alreadyPaid: boolean
  amount: number | null
  landlord: { name: string; to: string[]; subject: string; message: string } | null
  housemates: { count: number; title: string; message: string }
}

export default function HoldingDepositModal({ applicantId, onClose, onDone }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState('')
  const [amount, setAmount] = useState('')
  const [landlord, setLandlord] = useState({ send: true, to: '', subject: '', message: '' })
  const [housemates, setHousemates] = useState({ send: true, title: '', message: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      const res = await fetch('/api/lettings/holding-deposit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId, action: 'draft' }),
      }).catch(() => null)
      const d = await res?.json().catch(() => null)
      if (!live) return
      if (!res?.ok || !d) { setLoadError(d?.error ?? 'Could not prepare the messages'); return }
      setDraft(d)
      setAmount(d.amount ? d.amount.toFixed(2) : '')
      setLandlord({ send: !!d.landlord?.to?.length, to: (d.landlord?.to ?? []).join(', '), subject: d.landlord?.subject ?? '', message: d.landlord?.message ?? '' })
      setHousemates({ send: d.housemates.count > 0, title: d.housemates.title, message: d.housemates.message })
    })()
    return () => { live = false }
  }, [applicantId])

  async function submit() {
    setSending(true); setError('')
    try {
      const res = await fetch('/api/lettings/holding-deposit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId, action: 'send', amount, landlord, housemates }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.recorded) throw new Error(d.error ?? 'Could not record the deposit')
      const parts = ['✅ Holding deposit recorded — offer completed']
      if (d.landlord) parts.push(`landlord emailed (${d.landlord})`)
      if (d.housemates) parts.push(`${d.housemates} told`)
      onDone(`${parts.join(' · ')}${d.errors?.length ? ` · ⚠️ ${d.errors.join('; ')}` : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the deposit')
    } finally {
      setSending(false)
    }
  }

  const field = 'w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 bg-white'
  const lbl = 'block text-xs font-bold uppercase tracking-wide text-neutral-600 mb-xs'

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
        {!draft && !loadError && <p className="py-xl text-center text-sm text-neutral-500">Writing the landlord letter and housemate intro…</p>}

        {draft && (
          <div className="space-y-lg">
            {draft.alreadyPaid && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">
                This offer is already marked as paid. Sending again will email the landlord and housemates a second time.
              </div>
            )}
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{error}</div>}

            <div className="max-w-xs">
              <label className={lbl}>Amount received (£)</label>
              <input inputMode="decimal" className={field} value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

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
                  <p className="text-[11px] text-neutral-500">Goes to their app (with a push) and by email. First name, work and interests only — check nothing personal or financial slipped in.</p>
                </>
              )}
            </section>

            <p className="text-xs text-neutral-500">You and the lettings team get a push confirming it’s recorded. The applicant moves on to referencing.</p>

            <div className="flex gap-md">
              <button onClick={onClose} disabled={sending} className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button onClick={submit} disabled={sending}
                className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40">
                {sending ? 'Sending…' : landlord.send || housemates.send ? 'Record deposit & send' : 'Record deposit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
