// The Finance pages' tabs on the dark band (components/PageHero) — the same order as the Finance menu, so every
// finance page can step to the others. Pass the current page's key, and the month where a page keeps one.
import type { HeroTab } from '@/components/PageHero'

const TABS: [key: string, label: string, href: (month?: string) => string][] = [
  ['home', 'Finance home', m => `/admin/finance${m ? `?month=${m}` : ''}`],
  ['rent-roll', '1 · Rent roll', m => `/admin/rent-roll${m ? `?month=${m}` : ''}`],
  ['statements', '2 · Statements', () => '/admin/statements'],
  ['payment-run', '3 · Payment run', m => `/admin/payment-run${m ? `?month=${m}` : ''}`],
  ['bank', 'Bank & matching', () => '/admin/reconciliation'],
  ['expenses', 'Expenses', () => '/admin/expense-log'],
  ['arrears', 'Arrears', () => '/admin/arrears'],
  ['client-money', 'Client money', () => '/admin/client-money'],
  ['deposits', 'Deposits', () => '/admin/deposits'],
  ['reports', 'Reports', () => '/admin/reports'],
]

export const financeTabs = (active: string, month?: string): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href: href(month), active: key === active }))
