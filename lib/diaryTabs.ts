// Diary is one place (3 Nov 2026 admin tidy-up): the week of property appointments you drag to reschedule, and
// everything together — viewings, repairs, cleans and appointments — where visits and cleans are booked. The older
// Calendar showed the same as "Everything" and now opens it. Each keeps its own address so old links work.
import type { HeroTab } from '@/components/PageHero'

const TABS: [key: string, label: string, href: string][] = [
  ['week', 'Week', '/admin/appointments'],
  ['all', 'Everything', '/admin/agency-diary'],
]
export const diaryTabs = (active: 'week' | 'all'): HeroTab[] => TABS.map(([key, label, href]) => ({ label, href, active: key === active }))
