// Documents is one place (3 Nov 2026 admin tidy-up): everything coming in — photos and post from your phone
// (Capture), certificates and paperwork read by AI (scanner), what's emailed in (inbox) — and the filed library.
// Each keeps its own address so old links work.
import type { HeroTab } from '@/components/PageHero'

const TABS: [key: string, label: string, href: string][] = [
  ['capture', 'Capture', '/admin/capture'],
  ['scan', 'Scan & file', '/admin/ai-upload'],
  ['inbox', 'Emailed in', '/admin/inbox'],
  ['library', 'Library', '/admin/documents'],
]
export const documentTabs = (active: 'capture' | 'scan' | 'inbox' | 'library'): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href, active: key === active }))
