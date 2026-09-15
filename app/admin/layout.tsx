'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

const DASHBOARD = { emoji: '⚡', label: 'Dashboard', href: '/admin', exact: true }

// Sortable items — stored / restored by href key
const SORTABLE_NAV = [
  { emoji: '📅', label: 'Appointments',    href: '/admin/appointments' },
  { emoji: '💬', label: 'Communications',  href: '/admin/communications' },
  { emoji: '✅', label: 'Compliance',      href: '/admin/compliance' },
  { emoji: '📄', label: 'Documents',       href: '/admin/documents' },
  { emoji: '🧾', label: 'Expense Log',     href: '/admin/expense-log' },
  { emoji: '🛏️', label: 'Lettings',        href: '/admin/available-and-lettings' },
  { emoji: '🔧', label: 'Maintenance',     href: '/admin/maintenance' },
  { emoji: '👥', label: 'People',          href: '/admin/people' },
  { emoji: '🗂️', label: 'Planner',         href: '/admin/planner' },
  { emoji: '🏢', label: 'Properties',      href: '/admin/active-rooms' },
  { emoji: '📋', label: 'Property Tasks',  href: '/admin/property-tasks' },
]

const STORAGE_KEY = 'admin_nav_order'

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return SORTABLE_NAV.map(n => n.href)
    const saved: string[] = JSON.parse(raw)
    // Merge: honour saved order, append any new items at end
    const known = new Set(saved)
    const extra = SORTABLE_NAV.map(n => n.href).filter(h => !known.has(h))
    return [...saved.filter(h => SORTABLE_NAV.some(n => n.href === h)), ...extra]
  } catch {
    return SORTABLE_NAV.map(n => n.href)
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [order,       setOrder]       = useState<string[]>(() => SORTABLE_NAV.map(n => n.href))
  const [mounted,     setMounted]     = useState(false)
  const [dragging,    setDragging]    = useState<string | null>(null)
  const [dragOver,    setDragOver]    = useState<string | null>(null)
  const dragItem    = useRef<string | null>(null)
  const dragOverItem = useRef<string | null>(null)

  // Hydrate from localStorage once on client
  useEffect(() => { setOrder(loadOrder()); setMounted(true) }, [])

  function saveOrder(next: string[]) {
    setOrder(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  function onDragStart(href: string) {
    dragItem.current    = href
    setDragging(href)
  }

  function onDragEnter(href: string) {
    dragOverItem.current = href
    setDragOver(href)
  }

  function onDragEnd() {
    if (dragItem.current && dragOverItem.current && dragItem.current !== dragOverItem.current) {
      const next = [...order]
      const from = next.indexOf(dragItem.current)
      const to   = next.indexOf(dragOverItem.current)
      if (from !== -1 && to !== -1) {
        next.splice(from, 1)
        next.splice(to, 0, dragItem.current)
        saveOrder(next)
      }
    }
    dragItem.current     = null
    dragOverItem.current = null
    setDragging(null)
    setDragOver(null)
  }

  // Build sorted list (stable pre-hydration = default alphabetical to avoid flash)
  const sortedNav = mounted
    ? order.map(h => SORTABLE_NAV.find(n => n.href === h)!).filter(Boolean)
    : SORTABLE_NAV

  function isActive(item: typeof DASHBOARD) {
    return item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/')
  }

  return (
    <div className="flex min-h-screen bg-neutral-100">
      {/* ── Sidebar: desktop only ── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-neutral-950 text-white fixed inset-y-0 left-0 z-40 overflow-hidden">
        {/* Wordmark */}
        <div className="px-5 pt-7 pb-5 border-b border-white/10">
          <div className="leading-none">
            <p className="text-[15px] font-light tracking-[0.3em] uppercase text-white">CAPITAL</p>
            <p className="text-[15px] font-light tracking-[0.3em] uppercase text-white mt-0.5">ROOMS</p>
          </div>
          <p className="text-[9px] text-white/30 mt-2 tracking-[0.15em] uppercase">Admin portal</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {/* Dashboard — always pinned, not draggable */}
          <Link
            href={DASHBOARD.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive(DASHBOARD)
                ? 'bg-white/10 text-white ring-1 ring-blue-400/50'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="text-base leading-none">{DASHBOARD.emoji}</span>
            <span>{DASHBOARD.label}</span>
          </Link>

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-white/5" />

          {/* Sortable items */}
          {sortedNav.map(item => {
            const active = isActive(item)
            const isDraggingThis = dragging === item.href
            const isDragTarget   = dragOver  === item.href && dragOver !== dragging
            return (
              <div
                key={item.href}
                draggable
                onDragStart={() => onDragStart(item.href)}
                onDragEnter={() => onDragEnter(item.href)}
                onDragOver={e => { e.preventDefault() }}
                onDragEnd={onDragEnd}
                className={`group relative transition-all ${
                  isDraggingThis ? 'opacity-30' : 'opacity-100'
                } ${isDragTarget ? 'translate-y-0.5' : ''}`}
                style={{ cursor: 'grab' }}
              >
                {/* Drop indicator line */}
                {isDragTarget && (
                  <div className="absolute -top-0.5 left-2 right-2 h-0.5 bg-blue-400 rounded-full" />
                )}
                <Link
                  href={item.href}
                  draggable={false}   /* let the wrapper handle drag */
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="text-base leading-none">{item.emoji}</span>
                  <span className="flex-1">{item.label}</span>
                  {/* Drag handle hint on hover */}
                  <span className="opacity-0 group-hover:opacity-30 text-white text-xs select-none transition-opacity">⠿</span>
                </Link>
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 space-y-2">
          <Link
            href="/install"
            className="flex items-center gap-2 text-[11px] text-white/30 hover:text-white/60 transition-colors"
          >
            <span>📲</span>
            <span>Install the app</span>
          </Link>
          <p className="text-[10px] text-white/20 truncate">harry@capitalrooms.co.uk</p>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 min-w-0 md:ml-56">
        {children}
      </div>
    </div>
  )
}
