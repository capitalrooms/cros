'use client'

// Phone-only bottom tab bar for admin (hidden from md up — desktop is unchanged).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ZONES } from '@/lib/adminNav'

const FINANCE_ROUTES = ZONES.find(z => z.id === 'finance')?.routes ?? []

const TABS = [
  { href: '/admin', label: 'Today', match: (p: string) => p === '/admin',
    icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { href: '/admin/search', label: 'Search', match: (p: string) => p.startsWith('/admin/search'),
    icon: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></> },
  { href: '/admin/active-rooms', label: 'Properties', match: (p: string) => p.startsWith('/admin/properties') || p.startsWith('/admin/active-rooms'),
    icon: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M10 21v-4h4v4" /></> },
  { href: '/admin/money', label: 'Money', match: (p: string) => p.startsWith('/admin/money') || FINANCE_ROUTES.some(r => p === r || p.startsWith(r + '/')),
    icon: <path d="M16 6.5a4.5 4.5 0 0 0-8 2.8V13m-2 0h9m-9 6h12M8 13c0 3-1 5-2 6" /> },
]

export default function MobileTabBar() {
  const pathname = usePathname()
  const onTab = TABS.some(t => t.match(pathname))
  return (
    <nav
      aria-label="Admin sections"
      className="md:hidden flex-shrink-0 flex justify-around border-t border-neutral-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}
    >
      {TABS.map(t => {
        const active = t.match(pathname)
        return (
          <Link key={t.href} href={t.href} prefetch={false} aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-bold ${active ? 'text-neutral-950' : 'text-neutral-400'}`}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            {t.label}
          </Link>
        )
      })}
      <Link href="/admin/more" prefetch={false} aria-current={!onTab ? 'page' : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-bold ${!onTab ? 'text-neutral-950' : 'text-neutral-400'}`}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        More
      </Link>
    </nav>
  )
}
