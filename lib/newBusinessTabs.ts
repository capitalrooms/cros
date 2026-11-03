// New Business is one place (3 Nov 2026 admin tidy-up), its tabs in the order the work happens: introduce yourself,
// value the property, send the instruction, take them through onboarding & AML, then the agreement.
import type { HeroTab } from '@/components/PageHero'

const TABS: [key: string, label: string, href: string][] = [
  ['overview', 'Overview', '/admin/new-business'],
  ['intro', 'Introduction email', '/admin/new-business/acquisition'],
  ['valuation', 'Valuations', '/admin/valuations'],
  ['instruction', 'New instruction', '/admin/new-business/send-welcome'],
  ['onboarding', 'Onboarding & AML', '/admin/new-business/onboarding'],
  ['agreement', 'Agreements', '/admin/new-business/management-agreement'],
]
export const newBusinessTabs = (active: 'overview' | 'intro' | 'valuation' | 'instruction' | 'onboarding' | 'agreement'): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href, active: key === active }))
