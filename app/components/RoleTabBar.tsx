'use client'

// The bottom tab bar for the contractor and cleaner apps on every one of their screens (21 Oct 2026, Harry: "bottom
// bar needs to be in keeping with the style of admin bottom bar") — the same bar as admin (PhoneTabBar), the same
// tabs on the home screen and inside a job, a clean, invoices or the profile, counts as a badge on the icon.
// On the home screen `onPick` switches the tab in place; anywhere else each tab is a link back to it.
import PhoneTabBar, { ICONS, type PhoneTab } from '@/app/components/PhoneTabBar'

export type ContractorTab = 'jobs' | 'quotes' | 'done' | 'invoices' | 'me'
export type CleanerTab = 'today' | 'upcoming' | 'done' | 'compliance' | 'me'

const CONTRACTOR: { key: ContractorTab; label: string; icon: PhoneTab['icon']; href: string }[] = [
  { key: 'jobs', label: 'Jobs', icon: ICONS.wrench, href: '/contractor' },
  { key: 'quotes', label: 'Quotes', icon: ICONS.notes, href: '/contractor?tab=quotes' },
  { key: 'done', label: 'Done', icon: ICONS.check, href: '/contractor?tab=done' },
  { key: 'invoices', label: 'Invoices', icon: ICONS.invoice, href: '/contractor/invoices' },
  { key: 'me', label: 'Me', icon: ICONS.me, href: '/contractor/profile' },
]
const CLEANER: { key: CleanerTab; label: string; icon: PhoneTab['icon']; href: string }[] = [
  { key: 'today', label: 'Today', icon: ICONS.home, href: '/cleaner' },
  { key: 'upcoming', label: 'Upcoming', icon: ICONS.calendar, href: '/cleaner?tab=upcoming' },
  { key: 'done', label: 'Done', icon: ICONS.check, href: '/cleaner?tab=done' },
  { key: 'compliance', label: 'Compliance', icon: ICONS.notes, href: '/cleaner?tab=compliance' },
  { key: 'me', label: 'Me', icon: ICONS.me, href: '/cleaner/profile' },
]

export function RoleTabBar<T extends string>({ role, active, onPick, badges = {}, inPage = [] }: {
  role: 'contractor' | 'cleaner'
  active: T | null
  /** home screen only: switch these tabs in place instead of following the link */
  onPick?: (key: T) => void
  inPage?: T[]
  badges?: Partial<Record<T, number>>
}) {
  const list = (role === 'contractor' ? CONTRACTOR : CLEANER) as { key: T; label: string; icon: PhoneTab['icon']; href: string }[]
  return (
    <>
      {/* room for the bar so the last thing on the screen isn't hidden behind it */}
      <div className="h-20 lg:hidden" aria-hidden="true" />
      <PhoneTabBar fixed className="lg:hidden" label={role === 'contractor' ? 'Contractor sections' : 'Cleaner sections'} tabs={list.map(t => ({
        key: t.key, label: t.label, icon: t.icon, active: active === t.key, badge: badges[t.key],
        ...(onPick && inPage.includes(t.key) ? { onClick: () => { onPick(t.key); window.scrollTo({ top: 0 }) } } : { href: t.href }),
      }))} />
    </>
  )
}
