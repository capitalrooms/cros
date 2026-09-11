'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { emoji: '⚡', label: 'Dashboard',       href: '/admin',                       exact: true },
  { emoji: '🏢', label: 'Properties',      href: '/admin/properties' },
  { emoji: '📋', label: 'Property Tasks',  href: '/admin/property-tasks' },
  { emoji: '🔧', label: 'Maintenance',     href: '/admin/maintenance' },
  { emoji: '🛏️', label: 'Lettings',        href: '/admin/available-and-lettings' },
  { emoji: '✅', label: 'Compliance',      href: '/admin/compliance' },
  { emoji: '📄', label: 'Documents',       href: '/admin/documents' },
  { emoji: '👥', label: 'People',          href: '/admin/people' },
  { emoji: '💬', label: 'Communications',  href: '/admin/communications' },
  { emoji: '📅', label: 'Appointments',    href: '/admin/appointments' },
  { emoji: '🧾', label: 'Expense Log',     href: '/admin/expense-log' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

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
          {NAV.map(item => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="text-base leading-none">{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
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

      {/* ── Main area: full width on mobile, offset by sidebar on desktop ── */}
      <div className="flex-1 min-w-0 md:ml-56">
        {children}
      </div>
    </div>
  )
}
