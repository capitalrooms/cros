'use client'

// The scheme's contact details printed on the prescribed information, and whether the DPS Terms and Conditions
// (which must go with it) are in place. lib/deposits/prescribedInfo.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Details { name: string; address: string; phone: string; email: string; website: string }
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'

export default function SchemeDetails({ onReady }: { onReady: (ready: boolean) => void }) {
  const [d, setD] = useState<Details | null>(null)
  const [saved, setSaved] = useState(false)
  const [terms, setTerms] = useState(true)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    adminFetch('/api/admin/deposits/scheme').then(r => r.json()).then(j => { setD(j.details); setSaved(!!j.saved); setTerms(!!j.termsReady); onReady(!!j.termsReady && !!j.saved) }).catch(() => {})
  }, [onReady])

  async function save() {
    const r = await adminFetch('/api/admin/deposits/scheme', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(j.error || 'Could not save'); return }
    setSaved(true); setMsg('Saved'); onReady(terms); setTimeout(() => setMsg(''), 2000)
  }

  if (!d) return null
  return (
    <section className="rounded-2xl bg-white p-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="font-bold text-neutral-900">Prescribed information</h2>
          <p className="text-sm text-neutral-600">Each tenancy’s own prescribed information, on your letterhead, emailed with the DPS Terms and Conditions — the date is recorded when it’s sent.</p>
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-sm font-bold text-neutral-700 underline">{open ? 'Close' : 'Scheme details'}</button>
      </div>
      {!saved && <p className="mt-sm rounded-lg border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">Check the DPS’s contact details (Scheme details) and save them once — they go on a legal notice.</p>}
      {!terms && <p className="mt-sm rounded-lg border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">The DPS Terms and Conditions must be attached to every prescribed information (the DPS form, note 1). They’re not in CROS yet, so sending is off until they’re added.</p>}
      {open && (
        <div className="mt-md grid gap-sm sm:grid-cols-2">
          {(['name', 'address', 'phone', 'email', 'website'] as const).map(k => (
            <label key={k} className="text-xs font-semibold capitalize text-neutral-700">{k}<input className={input} value={d[k]} onChange={e => setD({ ...d, [k]: e.target.value })} /></label>
          ))}
          <div className="flex items-end gap-sm"><button onClick={save} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white">Save</button>{msg && <span className="text-sm text-neutral-600">{msg}</span>}</div>
        </div>
      )}
    </section>
  )
}
