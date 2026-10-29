'use client'

// Phone-only bottom tab bar for admin (hidden from md up — desktop is unchanged). Drawn by the shared
// app/components/PhoneTabBar, the same bar lettings, cleaners and contractors have.
// 29 Oct 2026, Harry: the day-to-day ones are Properties, Maintenance and Calendar. Search is at the top of More;
// Money is in More under Finance.
import { usePathname } from 'next/navigation'
import PhoneTabBar, { ICONS } from '@/app/components/PhoneTabBar'

const TABS = [
  { href: '/admin', label: 'Today', match: (p: string) => p === '/admin', icon: ICONS.home },
  { href: '/admin/active-rooms', label: 'Properties', match: (p: string) => p.startsWith('/admin/properties') || p.startsWith('/admin/active-rooms'), icon: ICONS.building },
  { href: '/admin/maintenance', label: 'Maintenance', match: (p: string) => p.startsWith('/admin/maintenance') || p.startsWith('/admin/jobs'), icon: ICONS.wrench },
  { href: '/admin/appointments', label: 'Calendar', match: (p: string) => p.startsWith('/admin/appointments') || p.startsWith('/admin/calendar'), icon: ICONS.calendar },
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
