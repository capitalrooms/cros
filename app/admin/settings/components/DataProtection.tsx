'use client'
// Settings › Data protection: are bank details stored encrypted, and lock the ones saved before encryption was
// switched on (app/api/admin/security/encrypt-bank). Administrators only — anyone else sees nothing.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Place = { place: string; locked: number; open: number }
const LABEL: Record<string, string> = {
  landlord_bank_accounts: 'Landlord bank accounts', properties: 'Property payee accounts',
  supplier_profiles: 'Contractor and cleaner accounts', landlord_onboarding: 'Landlord onboarding forms',
}

export default function DataProtection() {
  const [state, setState] = useState<{ keySet: boolean; places: Place[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const load = () => adminFetch('/api/admin/security/encrypt-bank').then(r => r.ok ? r.json() : null).then(setState).catch(() => {})
  useEffect(() => { load() }, [])
  if (!state) return null
  const open = state.places.reduce((n, p) => n + p.open, 0)

  async function lockAll() {
    setBusy(true); setMsg('')
    const r = await adminFetch('/api/admin/security/encrypt-bank', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? `Locked ${d.locked} record${d.locked === 1 ? '' : 's'}.${d.failed ? ` ${d.failed} couldn’t be changed — try again.` : ''}` : d.error ?? 'Couldn’t do that — try again')
    if (d.places) setState(s => s ? { ...s, places: d.places } : s)
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
      <div className="px-lg py-md border-b border-neutral-100">
        <h2 className="font-bold text-neutral-900 text-base">Data protection</h2>
      </div>
      <div className="px-lg py-lg space-y-md">
        <p className="text-sm text-neutral-700">
          {state.keySet
            ? 'Bank details are stored encrypted. Someone with a copy of the database alone can’t read them — the key is kept separately.'
            : 'Encryption is ready but not switched on yet: the key needs adding on Vercel (CROS_FIELD_KEY). Until then bank details are stored as before.'}
        </p>
        <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {state.places.map(p => (
            <div key={p.place} className="flex items-center justify-between px-md py-sm text-sm">
              <span className="text-neutral-800">{LABEL[p.place] ?? p.place}</span>
              <span className={p.open ? 'text-amber-700' : 'text-green-700'}>{p.locked} locked{p.open ? ` · ${p.open} not yet` : ''}</span>
            </div>
          ))}
        </div>
        {state.keySet && open > 0 && (
          <button type="button" onClick={lockAll} disabled={busy}
            className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {busy ? 'Locking…' : `Lock the ${open} saved before`}
          </button>
        )}
        {msg && <p className="text-sm text-neutral-700">{msg}</p>}
      </div>
    </div>
  )
}
