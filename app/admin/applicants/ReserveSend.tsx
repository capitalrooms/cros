'use client'

// Send the reserve email — see it first (23 Oct 2026, Harry: "no way of updating or seeing what they will actually be
// asked to pay when you send reserve"). The rent is filled from what's agreed (the offer), else the asking rent, and
// can be changed; the holding deposit (one week) and the exact email update as you type. Sending pins that rent for the
// reserve page and the holding deposit. A re-send with a different rent says it replaces the earlier email.
import { useEffect, useRef, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const oneWeek = (m: number) => Math.round(((m * 12) / 52) * 100) / 100
type Preview = { to: string; subject: string; html: string; rent: number | null; deposit: number | null; pinned: number | null; asking: number | null; earlier: { at: string; rent: number | null } | null }

export default function ReserveSend({ applicant, onClose, onSent }: { applicant: { id: string; full_name: string; email: string }; onClose: () => void; onSent: () => void }) {
  const [rent, setRent] = useState('')
  const [p, setP] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const first = useRef(true)

  const preview = async (r?: number) => {
    const res = await adminFetch(`/api/applicants/${applicant.id}/accept-offer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: true, ...(r ? { rent: r } : {}) }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error ?? 'The email couldn’t be prepared'); return }
    setP(d); setError(null)
    if (first.current) { first.current = false; const start = d.pinned ?? d.asking; if (start) { setRent(String(start)); if (!d.rent || d.rent !== start) preview(start) } }
  }
  useEffect(() => { preview() }, [applicant.id])
  useEffect(() => {
    if (first.current) return
    const n = Number(rent.replace(/[£,\s]/g, ''))
    if (!(n > 0)) return
    const t = setTimeout(() => preview(n), 400)
    return () => clearTimeout(t)
  }, [rent])

  const n = Number(rent.replace(/[£,\s]/g, ''))
  async function send() {
    if (!(n > 0)) { setError('Enter the monthly rent that’s been agreed.'); return }
    setSending(true); setError(null)
    try {
      const res = await adminFetch(`/api/applicants/${applicant.id}/accept-offer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rent: n }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Not sent'); return }
      onSent()
    } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/50 md:items-center md:p-lg" role="dialog" aria-modal="true" aria-label="Send the reserve email">
      <div className="flex w-full flex-col overflow-hidden bg-white md:max-h-[92vh] md:max-w-3xl md:rounded-2xl">
        <div className="flex items-start justify-between gap-md border-b border-neutral-200 px-lg py-md">
          <div><p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Send the reserve email</p><p className="text-lg font-bold text-neutral-900">{applicant.full_name}</p><p className="text-xs text-neutral-500">{applicant.email}</p></div>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
        </div>
        <div className="flex-1 space-y-md overflow-y-auto px-lg py-md">
          <div className="grid gap-md sm:grid-cols-3">
            <label className="block text-xs font-semibold text-neutral-700">Monthly rent agreed (£)
              <input inputMode="decimal" value={rent} onChange={e => setRent(e.target.value)} className="mt-xs w-full rounded-lg border border-neutral-300 px-md py-sm text-lg font-bold" />
            </label>
            <div className="rounded-lg bg-neutral-50 px-md py-sm"><p className="text-xs text-neutral-500">Holding deposit (one week)</p><p className="text-lg font-bold tabular-nums">{n > 0 ? gbp(oneWeek(n)) : '—'}</p></div>
            <div className="rounded-lg bg-neutral-50 px-md py-sm text-xs text-neutral-600">
              {p?.asking ? <p>Asking rent: <strong>{gbp(p.asking)}</strong></p> : null}
              {p?.pinned ? <p>On the offer: <strong>{gbp(p.pinned)}</strong></p> : null}
            </div>
          </div>
          {p?.earlier && p.earlier.rent && n > 0 && Math.abs(p.earlier.rent - n) > 0.004 && (
            <p className="rounded-lg bg-amber-50 px-md py-sm text-sm text-amber-900">They were emailed {gbp(p.earlier.rent)} on {new Date(p.earlier.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}. This email says it replaces that one, with the new figures.</p>
          )}
          {error && <p className="rounded-lg bg-red-50 px-md py-sm text-sm font-semibold text-red-800">{error}</p>}
          <div>
            <p className="mb-xs text-xs font-bold uppercase tracking-wide text-neutral-500">What they’ll get</p>
            {p ? <>
              <p className="mb-xs text-sm"><span className="text-neutral-500">Subject:</span> <strong>{p.subject}</strong></p>
              <iframe title="Email preview" srcDoc={p.html} sandbox="" className="h-[460px] w-full rounded-lg border border-neutral-200" />
            </> : <p className="text-sm text-neutral-400">Preparing the preview…</p>}
          </div>
        </div>
        <div className="flex justify-end gap-sm border-t border-neutral-200 px-lg py-md">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold">Cancel</button>
          <button onClick={send} disabled={sending || !(n > 0) || !p} className="rounded-lg bg-green-700 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{sending ? 'Sending…' : `Send — ${n > 0 ? gbp(n) : '…'} a month`}</button>
        </div>
      </div>
    </div>
  )
}
