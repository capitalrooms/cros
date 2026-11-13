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
        // people/houses/jobs are for administrators; anyone else still finds screens, without an error
        if (res.status === 401 || res.status === 403) { setHits([]); setError(''); return }
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

/** The top bar's search-and-ask bar (13 Nov 2026, Harry: "just a nice search bar in the top would be better") — opens
 *  the finder over the page; a sentence there goes to the task bar. Replaces the Quick Notify button (Messages › Send to
 *  a house does that now) and the search box that was in the rail. */
export function TopSearch({ canAsk }: { canAsk: boolean }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event('cros:find'))} aria-label={canAsk ? 'Search or ask CROS' : 'Search'}
      className="flex h-9 min-w-0 items-center gap-2 rounded-full bg-white/10 px-2.5 text-left text-[13px] text-white/60 ring-1 ring-white/10 transition hover:bg-white/15 hover:text-white md:w-[min(340px,100%)] md:px-3">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
      <span className="hidden min-w-0 flex-1 truncate md:inline">{canAsk ? 'Search, or say what you need to do' : 'Search screens, people, houses'}</span>
      <kbd className="hidden rounded border border-white/20 px-1 text-[10px] font-sans lg:inline">⌘K</kbd>
    </button>
  )
}

/** The finder over the page: opened from the top bar, / or ⌘K anywhere. */
export default function AdminFinder({ allowed, canAsk = false }: { allowed: (href: string) => boolean; canAsk?: boolean }) {
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
    const onFind = () => setOpen(true)
    window.addEventListener('keydown', onKey); window.addEventListener('cros:find', onFind)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('cros:find', onFind) }
  }, [])
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); else { setQ(''); setActive(0) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(0), [q])

  const pick = (r: Row) => { setOpen(false); router.push(r.href) }
  // a sentence ("email the tenant of…") goes to the task bar — Enter does it unless you've arrowed into the results
  const sentence = canAsk && q.trim().split(/\s+/).length >= 3
  const askIt = () => { const t = q; setOpen(false); window.dispatchEvent(new CustomEvent('cros:task', { detail: t })) }
  const [moved, setMoved] = useState(false)
  useEffect(() => setMoved(false), [q])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (sentence && !moved) { setMoved(true); setActive(0) } else setActive(a => Math.min(a + 1, rows.length - 1)) }
    else if (e.key === 'Enter' && sentence && !moved) { e.preventDefault(); askIt() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && rows[active]) { e.preventDefault(); pick(rows[active]) }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 px-md pt-[12vh]" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-label="Search the office console">
            <label className="flex items-center gap-2 border-b border-neutral-200 px-md py-sm">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-neutral-400" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>
              <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} type="search" placeholder={canAsk ? 'Find a screen, person, house or job — or say what you need to do' : 'A screen, a person, a house, a room or a job'}
                className="flex-1 bg-transparent py-1 text-[15px] text-neutral-950 outline-none placeholder:text-neutral-400" />
              {loading && <span className="text-xs text-neutral-400">Searching…</span>}
              <kbd className="rounded border border-neutral-200 px-1 text-[10px] text-neutral-400">Esc</kbd>
            </label>
            <div className="max-h-[60vh] overflow-y-auto">
              {/* a sentence rather than a name → hand it to the task bar (13 Nov 2026) */}
              {sentence && (
                <button type="button" onClick={askIt}
                  className={`flex w-full items-center gap-2 border-b border-neutral-100 px-md py-sm text-left text-[14px] hover:bg-neutral-50 ${!moved ? 'bg-amber-50' : ''}`}>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent,#E8B931)] text-[var(--ink,#23261A)]"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" /></svg></span>
                  <span className="min-w-0 flex-1 truncate"><b className="font-semibold">Ask CROS to do this:</b> <span className="text-neutral-600">{q.trim()}</span></span>
                  <kbd className="rounded border border-neutral-200 px-1 text-[10px] text-neutral-400">Enter</kbd>
                </button>
              )}
              {!q.trim() && <p className="px-md py-md text-sm text-neutral-500">Try “deposits”, “Claverton”, a tenant’s name, a phone number or “boiler”.{canAsk && <> Or say what you need: “text everyone at Willis Road that the engineer comes tomorrow”.</>}</p>}
              {rows.length > 0 && <Results rows={rows} active={sentence && !moved ? -1 : active} onPick={pick} onHover={i => { setMoved(true); setActive(i) }} />}
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
