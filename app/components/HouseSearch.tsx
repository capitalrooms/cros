'use client'

/**
 * HouseSearch — one box to find the house for an offer or a viewing (16 Oct 2026).
 *
 * Type a house name, street or postcode: houses already in CROS come first ("On file"), then real UK addresses
 * from the address lookup (a postcode lists every home in it). Picking an address we already have selects that
 * house; picking a new one hands it back to add as a let-only house — so the address is only ever typed once.
 */

import { useEffect, useRef, useState } from 'react'
import { splitAddress } from './AddressField'
import { sameHouse } from '@/lib/letOnly/sameHouse'

export interface House { id: string; name?: string | null; address?: string | null; postcode?: string | null; letting_type?: string | null }

interface Props {
  houses: House[]
  selectedId: string
  onHouse: (id: string) => void
  onNew: (line1: string, postcode: string) => void
  className?: string
}

const first = (v?: string | null) => String(v ?? '').split(/[,\n]/)[0].trim()
const words = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)

export default function HouseSearch({ houses, selectedId, onHouse, onNew, className = '' }: Props) {
  const selected = houses.find(h => h.id === selectedId)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [found, setFound] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => { if (selected) setQ(first(selected.name) || first(selected.address)) }, [selectedId])   // eslint-disable-line react-hooks/exhaustive-deps

  const typed = q.trim()
  const ws = words(typed)
  const onFile = ws.length && !(selected && typed === (first(selected.name) || first(selected.address)))
    ? houses.filter(h => { const hay = words(`${h.name ?? ''} ${h.address ?? ''} ${h.postcode ?? ''}`).join(' '); return ws.every(w => hay.includes(w)) }).slice(0, 8)
    : []

  useEffect(() => {
    if (typed.length < 4 || (selected && typed === (first(selected.name) || first(selected.address)))) { setFound([]); return }
    let stale = false
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await fetch(`/api/admin/postcode-lookup?q=${encodeURIComponent(typed)}`)
        const j = await r.json().catch(() => ({}))
        if (!stale) setFound(j.mode === 'full' ? (j.addresses ?? []) : [])
      } catch { if (!stale) setFound([]) }
      finally { if (!stale) setBusy(false) }
    }, 300)
    return () => { stale = true; clearTimeout(t) }
  }, [typed])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  // an address we already have counts as that house, not a new one
  const fresh = found.map(raw => ({ raw, a: splitAddress(raw) }))
    .map(x => ({ ...x, house: houses.find(h => sameHouse(h, x.a.line1, x.a.postcode)) }))
  const known = fresh.filter(x => x.house && !onFile.some(h => h.id === x.house!.id))
  const knownIds = [...new Set(known.map(x => x.house!.id))]

  function chooseHouse(h: House) { setOpen(false); setQ(first(h.name) || first(h.address)); onHouse(h.id) }

  const row = 'block w-full border-b border-neutral-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-neutral-50'
  return (
    <div ref={wrap} className="relative">
      <input value={q} autoComplete="off" placeholder="House name, street or postcode…"
        onChange={e => { setQ(e.target.value); setOpen(true); if (selectedId) onHouse('') }}
        onFocus={() => setOpen(true)}
        className={className} />
      {busy && <span className="pointer-events-none absolute right-3 top-2.5 text-[10px] text-neutral-400">searching…</span>}
      {open && typed.length >= 2 && (onFile.length > 0 || knownIds.length > 0 || fresh.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
          {[...onFile, ...knownIds.map(id => houses.find(h => h.id === id)!)].map(h => (
            <button key={h.id} type="button" onMouseDown={e => { e.preventDefault(); chooseHouse(h) }} className={row}>
              <span className="font-medium text-neutral-900">{first(h.name) || first(h.address)}</span>
              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">On file{h.letting_type === 'let_only' ? ' · let only' : ''}</span>
              <span className="block text-xs text-neutral-500">{String(h.address ?? h.postcode ?? '').replace(/\s*\n\s*/g, ', ')}</span>
            </button>
          ))}
          {fresh.filter(x => !x.house).length > 0 && (
            <p className="bg-neutral-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">New address — add it as a let-only house</p>
          )}
          {fresh.filter(x => !x.house).map(({ raw, a }) => (
            <button key={raw} type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); setQ(a.line1); onNew(a.line1, a.postcode) }} className={row}>
              <span className="font-medium text-neutral-900">{a.line1}</span>
              <span className="block text-xs text-neutral-500">{[a.town, a.postcode].filter(Boolean).join(', ')}</span>
            </button>
          ))}
        </div>
      )}
      {open && typed.length >= 4 && !busy && onFile.length === 0 && fresh.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500 shadow-lg">
          Nothing found — try the postcode, or{' '}
          <button type="button" className="font-bold text-neutral-800 underline" onMouseDown={e => { e.preventDefault(); setOpen(false); onNew(typed, '') }}>add “{typed}” as a let-only house</button>
        </div>
      )}
    </div>
  )
}
