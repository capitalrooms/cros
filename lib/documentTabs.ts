// Documents is one place (3 Nov 2026 admin tidy-up): everything coming in — photos and post from your phone
// (Capture), certificates and paperwork read by AI (scanner), what's emailed in (inbox) — and the filed library.
// Each keeps its own address so old links work.
import type { HeroTab } from '@/components/PageHero'

// Capture takes everything coming in — phone, uploads and email — in one "To file" list (3 Nov 2026); the Library is
// everything filed. Scan & file and Emailed in still open for old links, under Capture.
const TABS: [key: string, label: string, href: string][] = [
  ['capture', 'Capture', '/admin/capture'],
  ['library', 'Library', '/admin/documents'],
]
export const documentTabs = (active: 'capture' | 'scan' | 'inbox' | 'library'): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href, active: key === active || (key === 'capture' && (active === 'scan' || active === 'inbox')) }))
