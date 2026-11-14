'use client'
// The tenant app's bottom bar on phones (14 Nov 2026, "Garden Ask"): Home, Repairs, Ask, House, You — on every tenant
// screen (drawn by app/tenant/layout). The current tab is the raised honey pill (app/globals.css .cr-tabbar).
import { usePathname } from 'next/navigation'
import PhoneTabBar, { ICONS } from '@/app/components/PhoneTabBar'

const SPARK = <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" />

export default function TenantTabBar() {
  const path = usePathname() ?? ''
  // screens with their own button bar along the bottom keep it to themselves
  if (path.startsWith('/tenant/icebreaker')) return null
  const on = (...p: string[]) => p.some(x => path === x || path.startsWith(x + '/'))
  const tabs = [
    { key: 'home', label: 'Home', icon: ICONS.home, href: '/tenant', active: path === '/tenant' },
    { key: 'repairs', label: 'Repairs', icon: ICONS.wrench, href: '/tenant/requests', active: on('/tenant/requests', '/tenant/maintenance', '/tenant/maintenance-smart', '/tenant/maintenance-choose', '/tenant/visit') },
    { key: 'ask', label: 'Ask', icon: SPARK, href: '/tenant/ask', active: on('/tenant/ask') },
    { key: 'house', label: 'House', icon: ICONS.people, href: '/tenant/housemates', active: on('/tenant/housemates', '/tenant/notices', '/tenant/property-info', '/tenant/icebreaker') },
    { key: 'you', label: 'You', icon: ICONS.me, href: '/tenant/profile', active: on('/tenant/profile', '/tenant/documents', '/tenant/give-notice') },
  ]
  return (
    <>
      <div className="h-28 bg-[#EEF2EC] lg:hidden" aria-hidden="true" />
      <PhoneTabBar fixed className="lg:hidden" label="Tenant sections" tabs={tabs} />
    </>
  )
}
