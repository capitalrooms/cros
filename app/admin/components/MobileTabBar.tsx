'use client'

// Phone-only bottom tab bar for admin (hidden from md up — desktop is unchanged). Drawn by the shared
// app/components/PhoneTabBar, the same bar lettings, cleaners and contractors have.
import { usePathname } from 'next/navigation'
import { ZONES } from '@/lib/adminNav'
import PhoneTabBar, { ICONS } from '@/app/components/PhoneTabBar'

const FINANCE_ROUTES = ZONES.find(z => z.id === 'finance')?.routes ?? []

const TABS = [
  { href: '/admin', label: 'Today', match: (p: string) => p === '/admin', icon: ICONS.home },
  { href: '/admin/search', label: 'Search', match: (p: string) => p.startsWith('/admin/search'), icon: ICONS.search },
  { href: '/admin/active-rooms', label: 'Properties', match: (p: string) => p.startsWith('/admin/properties') || p.startsWith('/admin/active-rooms'), icon: ICONS.building },
  { href: '/admin/money', label: 'Money', match: (p: string) => p.startsWith('/admin/money') || FINANCE_ROUTES.some(r => p === r || p.startsWith(r + '/')), icon: ICONS.money },
]

/** allowed: the person's access (lib/access/areas, from the layout) — tabs outside it aren't shown */
export default function MobileTabBar({ allowed = () => true }: { allowed?: (href: string) => boolean }) {
  const pathname = usePathname()
  const tabs = TABS.filter(t => allowed(t.href))
  const onTab = tabs.some(t => t.match(pathname))
  return (
    <PhoneTabBar label="Admin sections" tabs={[
      ...tabs.map(t => ({ key: t.href, label: t.label, icon: t.icon, href: t.href, active: t.match(pathname) })),
      { key: 'more', label: 'More', icon: ICONS.more, href: '/admin/more', active: !onTab },
    ]} />
  )
}
