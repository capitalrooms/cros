'use client'

// Phone Search tab — find any tenant, landlord, property, room or job from one box.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'
import type { SearchHit } from '@/app/api/admin/search/route'

const GROUPS: [SearchHit['kind'], string][] = [['person', 'People'], ['property', 'Properties'], ['room', 'Rooms'], ['job', 'Maintenance']]

export default function AdminSearchPage() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits(null); setError(''); return }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await adminFetch(`/api/admin/search?q=${encodeURIComponent(term)}`)
        const d = await res.json().catch(() => ({}))
        if (mine !== seq.current) return
        if (!res.ok) throw new Error(d.error || 'Search failed')
        setHits(d.hits); setError('')
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Search failed')
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="min-h-screen bg-neutral-100">
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-4">
        <h1 className="text-[26px] leading-tight font-bold text-neutral-950">Search</h1>
        <label className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-3 focus-within:ring-2 focus-within:ring-neutral-900">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400 shrink-0"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
          <input
            autoFocus type="search" inputMode="search" enterKeyHint="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Name, email, phone, address, room or job"
            className="flex-1 bg-transparent text-[16px] text-neutral-950 placeholder:text-neutral-400 outline-none"
          />
          {loading && <span className="text-xs text-neutral-400">…</span>}
        </label>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {q.trim().length < 2 && <p className="px-1 text-sm text-neutral-500">Type at least two letters. Phone numbers work too.</p>}
        {hits && hits.length === 0 && !loading && <p className="px-1 text-sm text-neutral-500">Nothing matches “{q.trim()}”.</p>}

        {hits && GROUPS.map(([kind, label]) => {
          const list = hits.filter(h => h.kind === kind)
          if (!list.length) return null
          return (
            <section key={kind} className="space-y-1.5">
              <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{label}</h2>
              <ul className="rounded-2xl bg-white divide-y divide-neutral-100 overflow-hidden">
                {list.map(h => (
                  <li key={h.kind + h.id}>
                    <Link href={h.href} className="block px-3.5 py-3 active:bg-neutral-50">
                      <p className="text-[15px] font-semibold text-neutral-950">{h.title}</p>
                      {h.detail && <p className="text-[13px] text-neutral-500">{h.detail}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
