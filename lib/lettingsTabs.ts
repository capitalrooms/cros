// Tenancies is one place (3 Nov 2026 admin tidy-up): the list of every tenancy, the people leaving (notice, asking to
// stay, check-out), and early move-out requests from the tenant app. Each keeps its own address so old links work.
import type { HeroTab } from '@/components/PageHero'

const TABS: [key: string, label: string, href: string][] = [
  ['list', 'Tenancies', '/admin/tenancies'],
  ['notice', 'On notice', '/admin/tenancy-management'],
  ['requests', 'Move-out requests', '/admin/early-move-out'],
]
export const tenancyTabs = (active: 'list' | 'notice' | 'requests'): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href, active: key === active }))
