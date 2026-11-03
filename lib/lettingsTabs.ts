// Tenancies is one place (3 Nov 2026 admin tidy-up): the list of every tenancy, the people leaving (notice, asking to
// stay, check-out), and early move-out requests from the tenant app. Each keeps its own address so old links work.
import type { HeroTab } from '@/components/PageHero'

const TABS: [key: string, label: string, href: string][] = [
  ['list', 'Tenancies', '/admin/tenancies'],
  ['notice', 'On notice', '/admin/tenancy-management'],
  ['requests', 'Move-out requests', '/admin/early-move-out'],
  ['reviews', 'Rent reviews', '/admin/rent-increase'],
]
export const tenancyTabs = (active: 'list' | 'notice' | 'requests' | 'reviews'): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href, active: key === active }))

// All Properties holds the portfolio and how long rooms have sat empty (3 Nov 2026 tidy-up).
export const propertyTabs = (active: 'all' | 'voids'): HeroTab[] =>
  ([['all', 'All properties', '/admin/active-rooms'], ['voids', 'Voids', '/admin/voids']] as const).map(([key, label, href]) => ({ label, href, active: key === active }))
