'use client'

// Notification bell for office and lettings staff: new offers, new reservations ("I've paid"), deposits recorded.
// Reads /api/staff/notifications; checks again every minute and whenever the window regains focus.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Note { id: string; title: string; body: string; link: string | null; read: boolean; created_at: string }

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function StaffNotificationBell({ className = '' }: { className?: string }) {
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/staff/notifications').catch(() => null)
    if (!res?.ok) return
    const d = await res.json().catch(() => null)
    if (d) { setNotes(d.notifications); setUnread(d.unread) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    window.addEventListener('focus', load)
    return () => { clearInterval(t); window.removeEventListener('focus', load) }
  }, [load])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const markRead = (body: object) =>
    fetch('/api/staff/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)

  async function openNote(n: Note) {
    if (!n.read) {
      setNotes(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)))
      setUnread(u => Math.max(0, u - 1))
      markRead({ ids: [n.id] })
    }
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  async function readAll() {
    setNotes(prev => prev.map(x => ({ ...x, read: true })))
    setUnread(0)
    await markRead({ all: true })
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        aria-label={unread ? `${unread} new notifications` : 'Notifications'}
        className="relative flex items-center justify-center w-8 h-8 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-[80] w-80 max-w-[calc(100vw-24px)] rounded-xl bg-white text-neutral-900 shadow-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between px-md py-sm border-b border-neutral-100">
            <p className="text-sm font-bold">Notifications</p>
            {unread > 0 && <button onClick={readAll} className="text-xs font-semibold text-neutral-500 hover:text-neutral-900">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notes.length === 0 ? (
              <p className="px-md py-lg text-sm text-neutral-400 text-center">Nothing yet — new offers and reservations appear here.</p>
            ) : notes.map(n => (
              <button key={n.id} onClick={() => openNote(n)}
                className={`w-full text-left px-md py-sm border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${n.read ? '' : 'bg-amber-50/60'}`}>
                <div className="flex items-start gap-sm">
                  {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-neutral-600 line-clamp-3">{n.body}</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{ago(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
