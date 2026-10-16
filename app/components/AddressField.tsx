'use client'

/**
 * AddressField — an address box you can just type into (16 Oct 2026).
 *
 * Drop-in for a plain <input>/<textarea> holding an address: type a street ("95 rope street") or a postcode and
 * matching UK addresses drop down; picking one fills the box (one line per part when `multiline`, otherwise
 * comma-separated). Typing anything else still works — it's an ordinary field that also searches.
 * Uses /api/admin/postcode-lookup?q= (public, so applicant and landlord forms can use it too).
 */

import { useEffect, useRef, useState } from 'react'

export interface PickedAddress {
  line1: string      // "95 Rope Street"
  town: string       // "London"
  postcode: string   // "SE16 7TF"
  lines: string[]    // every part, postcode last
}

interface Props {
  value: string
  onChange: (v: string) => void
  /** called as well as onChange when an address is picked from the list */
  onPick?: (a: PickedAddress) => void
  multiline?: boolean
  rows?: number
  className?: string
  placeholder?: string
  'aria-label'?: string
  id?: string
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

/** "95 Rope Street, London, SE16 7TF" → parts, with the postcode upper-case and "8, Royal Court" joined to "8 Royal Court" */
export function splitAddress(raw: string): PickedAddress {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  const merged: string[] = []
  for (const p of parts) {
    const prev = merged[merged.length - 1]
    if (prev && /^\d+[A-Z]?$/i.test(prev)) merged[merged.length - 1] = `${prev} ${p}`
    else merged.push(p)
  }
  const last = merged[merged.length - 1] ?? ''
  const m = last.match(POSTCODE)
  const postcode = m ? `${m[1]} ${m[2]}`.toUpperCase() : ''
  if (m) merged[merged.length - 1] = postcode
  const body = m ? merged.slice(0, -1) : merged
  return { line1: body.slice(0, Math.max(1, body.length - 1)).join(', '), town: body.length > 1 ? body[body.length - 1] : '', postcode, lines: merged }
}

export default function AddressField({ value, onChange, onPick, multiline, rows = 3, className = '', placeholder, id, ...rest }: Props) {
  const [hits, setHits] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = useRef(false)          // only search what the person typed — not a saved address being shown
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!typed.current) return
    const q = value.replace(/\s*\n+\s*/g, ', ').trim()
    if (q.length < 4 || q.length > 90 || !/[a-z0-9]/i.test(q)) { setHits([]); setOpen(false); return }
    let stale = false
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await fetch(`/api/admin/postcode-lookup?q=${encodeURIComponent(q)}`)
        const j = await r.json().catch(() => ({}))
        if (stale) return
        const list: string[] = j.mode === 'full' ? (j.addresses ?? []) : []
        setHits(list); setOpen(list.length > 0); setActive(-1)
      } catch { if (!stale) { setHits([]); setOpen(false) } }
      finally { if (!stale) setBusy(false) }
    }, 300)
    return () => { stale = true; clearTimeout(t) }
  }, [value])

  useEffect(() => {
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  function pick(raw: string) {
    const a = splitAddress(raw)
    typed.current = false
    setOpen(false); setHits([])
    onChange(a.lines.join(multiline ? '\n' : ', '))
    onPick?.(a)
  }

  function keys(e: React.KeyboardEvent) {
    if (!open || !hits.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(hits.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(hits[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  const common = {
    id, value, className, onKeyDown: keys, autoComplete: 'off' as const, 'aria-label': rest['aria-label'],
    placeholder: placeholder ?? 'Start typing the address or postcode…',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { typed.current = true; onChange(e.target.value) },
    onFocus: () => { if (hits.length && typed.current) setOpen(true) },
  }

  return (
    <div ref={wrap} className="relative">
      {multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}
      {busy && <span className="pointer-events-none absolute right-3 top-2.5 text-[10px] text-neutral-400">searching…</span>}
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white text-left shadow-lg" role="listbox">
          {hits.map((h, i) => {
            const a = splitAddress(h)
            return (
              <button key={h} type="button" role="option" aria-selected={i === active}
                onMouseDown={e => { e.preventDefault(); pick(h) }}
                className={`block w-full border-b border-neutral-100 px-3 py-2 text-left text-sm last:border-0 ${i === active ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}>
                <span className="font-medium text-neutral-900">{a.line1 || a.lines[0]}</span>
                <span className="block text-xs text-neutral-500">{[a.town, a.postcode].filter(Boolean).join(', ')}</span>
              </button>
            )
          })}
          <p className="px-3 py-1.5 text-[11px] italic text-neutral-400">{hits.length === 10 ? 'Not there? Type the postcode to see every address in it — or just type it in.' : 'Not listed? Just keep typing it in.'}</p>
        </div>
      )}
    </div>
  )
}
