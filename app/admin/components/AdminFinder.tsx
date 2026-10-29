'use client'

// Find anything in the office console from one box (29 Oct 2026, Harry: "search function would be useful on admin app as
// it's a nightmare to navigate that left side bar"). Screens come from the same list the rail uses (lib/adminNav), so a
// new page is findable the moment it's in the nav; people, houses, rooms and jobs come from /api/admin/search.
// Desktop: the box at the top of the rail, or press / or ⌘K anywhere. Phone: the top of More, and /admin/search.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ZONES } from '@/lib/adminNav'
import { adminFetch } from '@/lib/adminFetch'
import type { SearchHit } from '@/app/api/admin/search/route'

type Row = { key: string; group: string; title: string; detail?: string; href: string }
const KIND: Record<SearchHit['kind'], string> = { person: 'People', property: 'Properties', room: 'Rooms', job: 'Maintenance' }
const EXTRA = [
  { label: 'My profile', href: '/admin/profile', zone: 'You' }, { label: 'Settings', href: '/admin/settings', zone: 'You' },
  { label: 'Email signatures', href: '/admin/settings/signatures', zone: 'You' }, { label: 'Password & sign-in', href: '/account', zone: 'You' },
]
const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function useFinder(allowed: (href: string) => boolean) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)

  const screens = useMemo(() => [
    ...ZONES.flatMap(z => z.subnav.map(i => ({ label: i.label, href: i.href, zone: z.label }))),
    ...EXTRA,
  ].filter(s => s.href === '/account' || allowed(s.href)), [allowed])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits(null); setError(''); setLoading(false); return }
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
        if (mine === seq.current) { setHits([]); setError(e instanceof Error ? e.message : 'Search failed') }
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  const rows: Row[] = useMemo(() => {
    const term = norm(q)
    if (!term) return []
    const words = term.split(' ')
    const pages = screens
      .map(s => { const hay = norm(`${s.label} ${s.zone}`); const lab = norm(s.label); return { s, score: lab.startsWith(term) ? 0 : words.every(w => hay.includes(w)) ? 1 : -1 } })
      .filter(x => x.score >= 0).sort((a, b) => a.score - b.score || a.s.label.localeCompare(b.s.label))
      .slice(0, 6).map(({ s }) => ({ key: `page:${s.href}`, group: 'Screens', title: s.label, detail: s.zone, href: s.href }))
    const recs = (hits ?? []).map(h => ({ key: `${h.kind}:${h.id}`, group: KIND[h.kind], title: h.title, detail: h.detail, href: h.href }))
    return [...pages, ...recs]
  }, [q, screens, hits])

  return { q, setQ, rows, loading, error, searched: hits !== null }
}

function Results({ rows, active, onPick, onHover }: { rows: Row[]; active: number; onPick: (r: Row) => void; onHover: (i: number) => void }) {
  let last = ''
  return (
    <ul role="listbox" className="py-1">
      {rows.map((r, i) => {
        const head = r.group !== last ? r.group : ''
        last = r.group
        return (
          <li key={r.key} role="option" aria-selected={i === active}>
            {head && <p className="px-md pb-1 pt-sm text-[10.5px] font-bold uppercase tracking-[0.12em] text-neutral-400">{head}</p>}
            <button type="button" onMouseEnter={() => onHover(i)} onClick={() => onPick(r)}
              className={`flex w-full items-baseline justify-between gap-md px-md py-[7px] text-left ${i === active ? 'bg-neutral-100' : ''}`}>
              <span className="min-w-0 truncate text-[14px] font-medium text-neutral-900">{r.title}</span>
              {r.detail && <span className="shrink-0 truncate text-[12px] text-neutral-500 max-w-[45%]">{r.detail}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Desktop: a search field in the rail that opens a finder over the page. */
export default function AdminFinder({ allowed }: { allowed: (href: string) => boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const { q, setQ, rows, loading, error, searched } = useFinder(allowed)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); else { setQ(''); setActive(0) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(0), [q])

  const pick = (r: Row) => { setOpen(false); router.push(r.href) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, rows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && rows[active]) { e.preventDefault(); pick(rows[active]) }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center gap-2 rounded-[10px] bg-[#F6F3EC]/10 px-3 py-2 text-left text-[13px] text-[#F6F3EC]/60 hover:bg-[#F6F3EC]/15 hover:text-[#F6F3EC]">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
        <span className="flex-1">Search</span>
        <kbd className="rounded border border-[#F6F3EC]/20 px-1 text-[10px] font-sans">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 px-md pt-[12vh]" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-label="Search the office console">
            <label className="flex items-center gap-2 border-b border-neutral-200 px-md py-sm">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-neutral-400" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
              <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} type="search" placeholder="A screen, a person, a house, a room or a job"
                className="flex-1 bg-transparent py-1 text-[15px] text-neutral-950 outline-none placeholder:text-neutral-400" />
              {loading && <span className="text-xs text-neutral-400">Searching…</span>}
              <kbd className="rounded border border-neutral-200 px-1 text-[10px] text-neutral-400">Esc</kbd>
            </label>
            <div className="max-h-[60vh] overflow-y-auto">
              {!q.trim() && <p className="px-md py-md text-sm text-neutral-500">Try “deposits”, “Claverton”, a tenant’s name, a phone number or “boiler”.</p>}
              {rows.length > 0 && <Results rows={rows} active={active} onPick={pick} onHover={setActive} />}
              {q.trim().length >= 2 && searched && !loading && !rows.length && <p className="px-md py-md text-sm text-neutral-500">Nothing matches “{q.trim()}”.</p>}
              {error && <p className="px-md pb-sm text-xs text-red-700">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Phone: the same finder as a plain box with the results under it (More, /admin/search). */
export function InlineFinder({ allowed, autoFocus }: { allowed: (href: string) => boolean; autoFocus?: boolean }) {
  const router = useRouter()
  const { q, setQ, rows, loading, error, searched } = useFinder(allowed)
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-3 focus-within:ring-2 focus-within:ring-neutral-900">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-neutral-400" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
        <input autoFocus={autoFocus} type="search" inputMode="search" enterKeyHint="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search screens, people, houses, jobs" className="flex-1 bg-transparent text-[16px] text-neutral-950 outline-none placeholder:text-neutral-400" />
        {loading && <span className="text-xs text-neutral-400">…</span>}
      </label>
      {q.trim() && (rows.length > 0
        ? <div className="overflow-hidden rounded-2xl bg-white"><Results rows={rows} active={-1} onPick={r => router.push(r.href)} onHover={() => {}} /></div>
        : q.trim().length >= 2 && searched && !loading && <p className="px-1 text-sm text-neutral-500">Nothing matches “{q.trim()}”.</p>)}
      {error && <p className="px-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}
