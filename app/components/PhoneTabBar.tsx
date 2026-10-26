'use client'

// The app-style bottom tab bar on phones — one look for everyone (17 Oct 2026): admin (app/admin/components/
// MobileTabBar), lettings, cleaners and contractors. A tab is a link (href) or a switch within the page (onClick).
// `fixed`: pinned to the bottom of a normally-scrolling page (the role apps); admin's shell places it itself.
import Link from 'next/link'
import type { ReactNode } from 'react'

export interface PhoneTab { key: string; label: string; icon: ReactNode; href?: string; onClick?: () => void; active: boolean; /** a count shown as a small badge on the icon (never in the label) */ badge?: number }

export const ICONS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M10 21v-4h4v4" /></>,
  money: <path d="M16 6.5a4.5 4.5 0 0 0-8 2.8V13m-2 0h9m-9 6h12M8 13c0 3-1 5-2 6" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2 2M14 9l2 2" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M18.5 14.7c1.6.8 2.6 2.6 3 5.3" /></>,
  check: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 12.5l2.7 2.7L16.5 9" /></>,
  notes: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />,
  me: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4M12 17h.01" /></>,
  board: <><rect x="3.5" y="4" width="17" height="14" rx="2" /><path d="M8 21h8M12 18v3M7.5 9h9M7.5 13h6" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  more: null,
}

export default function PhoneTabBar({ tabs, label = 'Sections', fixed = false, className = 'md:hidden' }: { tabs: PhoneTab[]; label?: string; fixed?: boolean; className?: string }) {
  const item = (active: boolean) => `flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-bold ${active ? 'text-neutral-950' : 'text-neutral-400'}`
  const glyph = (t: PhoneTab) => t.icon === null
    ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
    : <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={t.active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
  const svg = (t: PhoneTab) => (
    <span className="relative">
      {glyph(t)}
      {!!t.badge && <span className="absolute -right-2.5 -top-1.5 min-w-[17px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[17px] text-white">{t.badge > 99 ? '99+' : t.badge}</span>}
    </span>
  )
  return (
    <nav aria-label={label}
      className={`cr-tabbar ${className} flex justify-around border-t border-neutral-200 bg-white/95 backdrop-blur ${fixed ? 'fixed inset-x-0 bottom-0 z-40' : 'flex-shrink-0'}`}
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}>
      {tabs.map(t => t.href
        ? <Link key={t.key} href={t.href} prefetch={false} aria-current={t.active ? 'page' : undefined} className={item(t.active)}>{svg(t)}{t.label}</Link>
        : <button key={t.key} type="button" onClick={t.onClick} aria-current={t.active ? 'page' : undefined} className={item(t.active)}>{svg(t)}{t.label}</button>)}
    </nav>
  )
}
