'use client'

// Landlords' correspondence addresses from their statements (3 Nov 2026): read each landlord's latest statement PDF
// and accept the address onto their profile. Nothing is saved until "Use this address" is pressed.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Cand { landlordId: string; name: string; current: string | null; statement: string }

export default function LandlordAddresses() {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Cand[] | null>(null)
  const [found, setFound] = useState<Record<string, { address: string | null; name: string | null; error?: string; saved?: boolean; busy?: boolean }>>({})
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open || list) return
    adminFetch('/api/admin/landlord-addresses').then(async r => { const j = await r.json().catch(() => ({})); if (r.ok) setList(j.landlords); else setErr(j.error ?? 'Couldn’t load') })
  }, [open, list])

  const read = async (c: Cand) => {
    setFound(f => ({ ...f, [c.landlordId]: { address: null, name: null, busy: true } }))
    const r = await adminFetch('/api/admin/landlord-addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', landlordId: c.landlordId }) })
    const j = await r.json().catch(() => ({}))
    setFound(f => ({ ...f, [c.landlordId]: r.ok ? { address: j.address, name: j.name } : { address: null, name: null, error: j.error ?? 'Couldn’t read it' } }))
  }
  const readAll = async () => { for (const c of (list ?? []).filter(c => !found[c.landlordId])) await read(c) }
  const save = async (c: Cand) => {
    const a = found[c.landlordId]?.address
    if (!a || !window.confirm(`Put this address on ${c.name}’s profile?\n\n${a}`)) return
    const r = await adminFetch('/api/admin/landlord-addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', landlordId: c.landlordId, address: a }) })
    if (r.ok) setFound(f => ({ ...f, [c.landlordId]: { ...f[c.landlordId], saved: true } }))
    else alert((await r.json().catch(() => ({}))).error ?? 'Couldn’t save')
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-blue-700 hover:underline">Fill landlords’ addresses from their statements</button>
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-lg space-y-sm">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div><h2 className="text-base font-bold">Addresses from statements</h2><p className="text-xs text-neutral-500">The address each landlord’s latest statement is sent to. Check it, then use it — nothing changes until you do.</p></div>
        <div className="flex gap-sm">{list && list.length > 0 && <button type="button" onClick={readAll} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-semibold text-white">Read them all</button>}<button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-600">Close</button></div>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {!list && !err && <p className="text-sm text-neutral-500">Finding each landlord’s latest statement…</p>}
      {list && !list.length && <p className="text-sm text-neutral-500">No statement emails found for your landlords.</p>}
      {list?.map(c => {
        const f = found[c.landlordId]
        return (
          <div key={c.landlordId} className="grid gap-sm border-t border-neutral-100 pt-sm text-sm sm:grid-cols-[1fr_1.2fr_1.2fr_auto] sm:items-start">
            <div><p className="font-semibold">{c.name}</p><p className="text-xs text-neutral-500">from {c.statement}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-neutral-400">On file</p><p className="whitespace-pre-line">{c.current || '—'}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-neutral-400">On the statement</p><p className="whitespace-pre-line">{f?.busy ? 'Reading…' : f?.error ? <span className="text-red-700">{f.error}</span> : f ? (f.address || 'No address shown') : '—'}</p></div>
            <div className="flex gap-sm">
              {!f && <button type="button" onClick={() => read(c)} className="rounded-lg border border-neutral-300 px-md py-xs font-semibold">Read</button>}
              {f?.address && !f.saved && <button type="button" onClick={() => save(c)} className="rounded-lg bg-neutral-900 px-md py-xs font-semibold text-white">Use this address</button>}
              {f?.saved && <span className="font-semibold text-green-700">Saved ✓</span>}
            </div>
          </div>
        )
      })}
    </section>
  )
}
