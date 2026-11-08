// Planner is one place (3 Nov 2026 admin tidy-up): your own boards, and the boards shared with each person.
import type { HeroTab } from '@/components/PageHero'

export const plannerTabs = (active: 'mine' | 'shared' | 'improvements'): HeroTab[] =>
  ([['mine', 'My boards', '/admin/planner'], ['shared', 'Shared with people', '/admin/planner/shared'], ['improvements', 'House improvements', '/admin/planner/improvements']] as const).map(([key, label, href]) => ({ label, href, active: key === active }))
