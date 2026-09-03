'use client'

/**
 * AdminNotificationBell
 *
 * Taps the same /api/admin/communications feed that the Communications Hub uses.
 * No new tables — badge and "unread" tracking is client-side (localStorage).
 *
 * Badge = items newer than the last time the bell was opened.
 * On open: saves now to localStorage so the count resets.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'

const LS_KEY = 'admin_bell_last_opened'

interface BellItem {
  id: string
  date: string
  type: 'Tenant' | 'Maintenance' | 'Landlord' | 'Cleaning' | 'Lettings' | 'Statement'
  from: string
  to: string
  message: string
  link: string | null
}

const TYPE_META: Record<string, { emoji: string; colour: string }> = {
  Tenant:      { emoji: '💬', colour: 'bg-blue-100 text-blue-800' },
  Maintenance: { emoji: '🔧', colour: 'bg-orange-100 text-orange-800' },
  Landlord:    { emoji: '🏠', colour: 'bg-purple-100 text-purple-800' },
  Cleaning:    { emoji: '🧹', colour: 'bg-yellow-100 text-yellow-800' },
  Lettings:    { emoji: '🔑', colour: 'bg-green-100 text-green-800' },
  Statement:   { emoji: '📊', colour: 'bg-indigo-100 text-indigo-800' },
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function AdminNotificationBell() {
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState<BellItem[]>([])
  const [loading, setLoading]   = useState(false)
  const [unread, setUnread]     = useState(0)
  const [lastOpened, setLastOpened] = useState<number>(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  // Read lastOpened from localStorage on mount + compute initial badge from recent
  useEffect(() => {
    const stored = parseInt(localStorage.getItem(LS_KEY) || '0', 10)
    setLastOpened(stored)
    // Fetch once to populate badge count without showing the panel
    fetchItems(stored, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchItems = useCallback(async (since: number, show: boolean) => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/communications')
      const json = await res.json()
      const all: any[] = json.messages || []

      // Normalise to BellItem (communications route already does heavy lifting)
      const mapped: BellItem[] = all.slice(0, 40).map((m: any) => ({
        id:      m.id,
        date:    m.date,
        type:    (m.type === 'Statement' ? 'Statement' : m.type) as BellItem['type'],
        from:    m.from,
        to:      m.to,
        message: m.message,
        link:    m.link,
      }))

      setItems(mapped.slice(0, 12))
      const newCount = mapped.filter(m => new Date(m.date).getTime() > since).length
      setUnread(newCount)
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function toggleOpen() {
    if (open) {
      setOpen(false)
      return
    }
    // Mark as read
    const now = Date.now()
    localStorage.setItem(LS_KEY, String(now))
    setLastOpened(now)
    setUnread(0)
    setOpen(true)
    fetchItems(now, true)
  }

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={toggleOpen}
        aria-label={`Notifications${unread ? ` (${unread} new)` : ''}`}
        className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors"
      >
        <span className="text-lg leading-none select-none">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-[4px] rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-neutral-200 bg-white shadow-2xl z-[100] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
            <span className="text-sm font-bold text-neutral-900">Activity</span>
            <Link
              href="/admin/communications"
              onClick={() => setOpen(false)}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              View all →
            </Link>
          </div>

          {/* Items */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-neutral-100">
            {loading && (
              <div className="px-4 py-8 text-center text-sm text-neutral-400">Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-neutral-400">No recent activity</div>
            )}
            {!loading && items.map((item) => {
              const meta = TYPE_META[item.type] ?? { emoji: '📌', colour: 'bg-neutral-100 text-neutral-700' }
              const isNew = new Date(item.date).getTime() > lastOpened && lastOpened > 0
              const inner = (
                <div className={`flex gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors ${isNew ? 'bg-blue-50/60' : ''}`}>
                  <span className="text-xl leading-none shrink-0 mt-0.5">{meta.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.colour}`}>
                        {item.type}
                      </span>
                      {isNew && (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                      <span className="text-[11px] text-neutral-400 ml-auto shrink-0">{relativeTime(item.date)}</span>
                    </div>
                    <p className="text-xs text-neutral-700 line-clamp-2 leading-snug">{item.message}</p>
                    {(item.from || item.to) && (
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        {item.from && <span>{item.from}</span>}
                        {item.from && item.to && <span> → </span>}
                        {item.to && <span>{item.to}</span>}
                      </p>
                    )}
                  </div>
                </div>
              )

              return item.link ? (
                <Link key={item.id} href={item.link} onClick={() => setOpen(false)} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={item.id}>{inner}</div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-neutral-100 bg-neutral-50">
            <Link
              href="/admin/communications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              Communications Hub
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
