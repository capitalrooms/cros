// Messages is one place (3 Nov 2026 admin tidy-up): everything sent and received, sending a quick message to a
// house, notes tenants must acknowledge, tenant feedback, and the wording of every automatic message. Each keeps its
// own address so old links work. (Letters & Invoices stays its own place — it makes documents.)
import type { HeroTab } from '@/components/PageHero'

const TABS: [key: string, label: string, href: string][] = [
  ['all', 'All messages', '/admin/communications'],
  ['send', 'Send to a house', '/admin/notify'],
  ['ack', 'Acknowledgments', '/admin/acknowledgment-notes'],
  ['feedback', 'Tenant feedback', '/admin/feedback'],
  ['templates', 'Templates', '/admin/message-templates'],
]
export const messageTabs = (active: 'all' | 'send' | 'ack' | 'feedback' | 'templates'): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href, active: key === active }))
