// The Finance pages' tabs on the dark band (components/PageHero) — the same order as the Finance menu, so every
// finance page can step to the others. Pass the current page's key, and the month where a page keeps one.
import type { HeroTab } from '@/components/PageHero'

const TABS: [key: string, label: string, href: (month?: string) => string][] = [
  ['home', 'Finance home', m => `/admin/finance${m ? `?month=${m}` : ''}`],
  ['rent-roll', '1 · Rent roll', m => `/admin/rent-roll${m ? `?month=${m}` : ''}`],
  ['statements', '2 · Statements', () => '/admin/statements'],
  ['payment-run', '3 · Payment run', m => `/admin/payment-run${m ? `?month=${m}` : ''}`],
  ['bank', 'Bank', () => '/admin/bank-calendar'],
  ['expenses', 'Expenses', () => '/admin/expense-log'],
  ['arrears', 'Arrears', () => '/admin/arrears'],
  ['client-money', 'Client money', () => '/admin/client-money'],
  ['deposits', 'Deposits', () => '/admin/deposits'],
  ['reports', 'Reports', () => '/admin/reports'],
]

// Bank is one place with three tabs (3 Nov 2026, Harry: "go ahead with the bank screens tidy up"): the calendar of what's
// been imported, importing a statement, and matching money in. Each keeps its own address so old links still work.
const BANK: [key: string, label: string, href: string][] = [
  ['calendar', 'Calendar', '/admin/bank-calendar'],
  ['import', 'Import a statement', '/admin/bank-import'],
  ['match', 'Matching', '/admin/reconciliation'],
]
export const bankTabs = (active: 'calendar' | 'import' | 'match'): HeroTab[] =>
  BANK.map(([key, label, href]) => ({ label, href, active: key === active }))

// Expenses is one place too (3 Nov 2026): the expense list, invoices to upload and file (Capture), contractor and cleaner
// invoices, the lines read off emailed statements (review), and the statements@ inbox (AutoLedger).
const EXPENSES: [key: string, label: string, href: string][] = [
  ['log', 'Expenses', '/admin/expense-log'],
  ['capture', 'Upload & file invoices', '/admin/capture'],
  ['contractor', 'Contractor invoices', '/admin/supplier-invoices'],
  ['review', 'Statement lines', '/admin/expense-review'],
  ['autoledger', 'AutoLedger', '/admin/autoledger'],
]
export const expenseTabs = (active: 'log' | 'capture' | 'contractor' | 'review' | 'autoledger'): HeroTab[] =>
  EXPENSES.map(([key, label, href]) => ({ label, href, active: key === active }))

export const financeTabs = (active: string, month?: string): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href: href(month), active: key === active }))
