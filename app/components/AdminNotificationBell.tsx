'use client'

/**
 * AdminNotificationBell
 *
 * Dropdown with last 10 notifications from /api/admin/communications.
 * Items stay until the user explicitly ticks them — dismissed IDs are
 * persisted in localStorage. A green ✓ reward animation plays on dismiss.
 *
 * The dropdown is rendered in a portal (appended to document.body) to escape
 * the AppBar's overflow-x-auto container, which would otherwise clip it.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

const LS_DISMISSED = 'admin_bell_dismissed_v2'

interface BellItem {
  id:      string
  date:    string
  type:    string
  from:    string
  to:      string
  message: string
  link:    string | null
}

const TYPE_META: Record<string, { emoji: string; colour: string }> = {
  Tenant:                   { emoji: '💬', colour: 'bg-blue-100 text-blue-800' },
  Maintenance:              { emoji: '🔧', colour: 'bg-orange-100 text-orange-800' },
  Landlord:                 { emoji: '🏠', colour: 'bg-purple-100 text-purple-800' },
  Cleaning:                 { emoji: '🧹', colour: 'bg-yellow-100 text-yellow-800' },
  Lettings:                 { emoji: '🔑', colour: 'bg-green-100 text-green-800' },
  Statement:                { emoji: '📊', colour: 'bg-indigo-100 text-indigo-800' },
  'Profile change request': { emoji: '👤', colour: 'bg-amber-100 text-amber-800' },
}

function relativeTime(iso: string) {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_DISMISSED) || '[]') } catch { return [] }
}
function writeDismissed(ids: string[]) {
  try { localStorage.setItem(LS_DISMISSED, JSON.stringify(ids.slice(-200))) } catch {}
}

export default function AdminNotificationBell() {
  const [open, setOpen]           = useState(false)
  const [allItems, setAllItems]   = useState<BellItem[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [rewarding, setRewarding] = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [panelPos, setPanelPos]   = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const [mounted, setMounted]     = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
    setDismissed(readDismissed())
    fetchItems()
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/communications')
      const json = await res.json()
      const all: BellItem[] = (json.messages || []).slice(0, 40).map((m: any) => ({
        id:      m.id,
        date:    m.date,
        type:    m.type,
        from:    m.from,
        to:      m.to,
        message: m.message,
        link:    m.link,
      }))
      setAllItems(all)
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        const panel = document.getElementById('bell-panel')
        if (panel && !panel.contains(e.target as Node)) setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function toggleOpen() {
    if (open) { setOpen(false); return }
    // Calculate position from button
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPanelPos({
        top:   rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
    setOpen(true)
    fetchItems()
  }

  function dismiss(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setRewarding(id)
    setTimeout(() => {
      setRewarding(null)
      const next = [...dismissed, id]
      setDismissed(next)
      writeDismissed(next)
    }, 700)
  }

  const activeItems = allItems.filter(i => !dismissed.includes(i.id)).slice(0, 10)
  const unreadCount = activeItems.length

  const panel = (
    <div
      id="bell-panel"
      style={{ position: 'fixed', top: panelPos.top, right: panelPos.right, zIndex: 9999, width: 384 }}
      className="rounded-xl border border-neutral-200 bg-white shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div>
          <span className="text-sm font-bold text-neutral-900">Notifications</span>
          {unreadCount > 0 && (
            <span className="ml-2 text-xs text-neutral-400">{unreadCount} to action</span>
          )}
        </div>
        <Link href="/admin/communications" onClick={() => setOpen(false)}
          className="text-xs text-blue-600 hover:underline font-medium">
          All activity →
        </Link>
      </div>

      {/* Items */}
      <div className="max-h-[480px] overflow-y-auto divide-y divide-neutral-100">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-neutral-400">Loading…</div>
        )}
        {!loading && activeItems.length === 0 && (
          <div className="px-4 py-10 text-center">
            <div className="text-3xl mb-3">✅</div>
            <p className="text-sm font-semibold text-neutral-600">All clear!</p>
            <p className="text-xs text-neutral-400 mt-1">No pending notifications.</p>
          </div>
        )}

        {!loading && activeItems.map(item => {
          const meta        = TYPE_META[item.type] ?? { emoji: '📌', colour: 'bg-neutral-100 text-neutral-700' }
          const isRewarding = rewarding === item.id

          const inner = (
            <div className={`relative flex gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors ${isRewarding ? 'pointer-events-none' : ''}`}>
              {isRewarding && (
                <div className="absolute inset-0 flex items-center justify-center bg-green-50/90 z-10">
                  <span className="tick-burst text-4xl">✅</span>
                </div>
              )}
              <span className="text-xl leading-none shrink-0 mt-0.5">{meta.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.colour}`}>
                    {item.type}
                  </span>
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
              {/* Tick to dismiss */}
              <button
                onClick={e => dismiss(item.id, e)}
                title="Mark as done"
                className="shrink-0 mt-0.5 w-6 h-6 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-300 hover:border-green-400 hover:text-green-500 hover:bg-green-50 transition-colors"
              >
                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
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
      <div className="px-4 py-2.5 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between">
        <span className="text-xs text-neutral-400">Tick ✓ to dismiss each item</span>
        {dismissed.length > 0 && (
          <button
            onClick={() => { setDismissed([]); writeDismissed([]) }}
            className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            Restore all
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @keyframes tick-burst {
          0%   { transform: scale(0.4); opacity: 0; }
          40%  { transform: scale(1.3); opacity: 1; }
          70%  { transform: scale(0.9); opacity: 1; }
          100% { transform: scale(1.1); opacity: 0; }
        }
        .tick-burst { animation: tick-burst 0.7s ease forwards; }
      `}</style>

      <div className="relative">
        <button
          ref={btnRef}
          onClick={toggleOpen}
          aria-label={`Notifications${unreadCount ? ` (${unreadCount} to action)` : ''}`}
          className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors"
        >
          <span className="text-lg leading-none select-none">🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-[4px] rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Portal: renders outside the AppBar overflow container */}
      {mounted && open && createPortal(panel, document.body)}
    </>
  )
}
