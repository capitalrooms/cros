// The Finance pages' tabs on the dark band (components/PageHero) — the same order as the Finance menu, so every
// finance page can step to the others. Pass the current page's key, and the month where a page keeps one.
import type { HeroTab } from '@/components/PageHero'
import { CROS_COLLECTS_RENT } from '@/lib/finance/mode'

// Import mode (now) shows only what's used; Pay mode (CROS_COLLECTS_RENT) adds the monthly cycle and client money
const TABS: [key: string, label: string, href: (month?: string) => string][] = CROS_COLLECTS_RENT ? [
  ['home', 'Finance home', m => `/admin/finance${m ? `?month=${m}` : ''}`],
  ['rent-roll', '1 · Rent roll', m => `/admin/rent-roll${m ? `?month=${m}` : ''}`],
  ['statements', '2 · Statements', () => '/admin/statements'],
  ['payment-run', '3 · Payment run', m => `/admin/payment-run${m ? `?month=${m}` : ''}`],
  ['bank', 'Bank', () => '/admin/bank-calendar'],
  ['books', 'Transactions', () => '/admin/books'],
  ['vat', 'VAT', () => '/admin/books/vat'],
  ['expenses', 'Expenses', () => '/admin/expense-log'],
  ['arrears', 'Arrears', () => '/admin/arrears'],
  ['client-money', 'Client money', () => '/admin/client-money'],
  ['deposits', 'Deposits', () => '/admin/deposits'],
  ['reports', 'Reports', () => '/admin/reports'],
] : [
  ['home', 'Finance home', m => `/admin/finance${m ? `?month=${m}` : ''}`],
  ['statements-in', 'Statements in', () => '/admin/statements/review'],
  ['statements', 'Statements', () => '/admin/statements'],
  ['expenses', 'Expenses', () => '/admin/expense-log'],
  ['books', 'Transactions', () => '/admin/books'],
  ['vat', 'VAT', () => '/admin/books/vat'],
  ['bank', 'Bank', () => '/admin/bank-calendar'],
  ['deposits', 'Deposits', () => '/admin/deposits'],
  ['reports', 'Reports', () => '/admin/reports'],
]

// Bank is one place with three tabs (3 Nov 2026, Harry: "go ahead with the bank screens tidy up"): the calendar of what's
// been imported, importing a statement, and matching money in. Each keeps its own address so old links still work.
const BANK: [key: string, label: string, href: string][] = [
  ['calendar', 'Calendar', '/admin/bank-calendar'],
  ['import', 'Import bank statement', '/admin/bank-import'],
  ['match', 'Reconciliation', '/admin/reconciliation'],
]
export const bankTabs = (active: 'calendar' | 'import' | 'match'): HeroTab[] =>
  BANK.map(([key, label, href]) => ({ label, href, active: key === active }))

// Expenses is one place too (3 Nov 2026): the expense list, contractor and cleaner invoices, the lines read off emailed statements (review), and the statements@ inbox (AutoLedger).
const EXPENSES: [key: string, label: string, href: string][] = [
  ['log', 'Expenses', '/admin/expense-log'],
  ['contractor', 'Supplier invoices', '/admin/supplier-invoices'],
  // the statement emails and their lines live on Statements in now (13 Nov 2026 tidy) — one place, not three
  ['ops', 'Office account', '/admin/ops-account'],
  // Capture is the whole office's inbox (photos, post, invoices), so it keeps its own page — this just goes there
  ['capture', 'Upload an invoice ↗', '/admin/capture'],
]
export const expenseTabs = (active: 'log' | 'contractor' | 'review' | 'autoledger' | 'ops'): HeroTab[] =>
  EXPENSES.map(([key, label, href]) => ({ label, href, active: key === active }))

// Income is one place (3 Nov 2026): what the agency earns — the monthly dashboard, and the fees report for any dates.
// Profit and loss (5 Nov 2026): directors only — the page itself says so to anyone else.
export const incomeTabs = (active: 'income' | 'fees' | 'pnl'): HeroTab[] =>
  ([['income', 'Agency income', '/admin/income'], ['fees', 'Fee income', '/admin/reports/fees'], ['pnl', 'Profit and loss', '/admin/company-pnl']] as const).map(([key, label, href]) => ({ label, href, active: key === active }))

// Rent owed is one place (3 Nov 2026 tidy-up): who hasn't paid this month, older arrears, and chasing them.
export const rentOwedTabs = (active: 'due' | 'arrears' | 'chase'): HeroTab[] =>
  ([['due', 'Rents due', '/admin/rents-due'], ['arrears', 'Arrears', '/admin/arrears'], ['chase', 'Arrears reminders', '/admin/rent-chase']] as const).map(([key, label, href]) => ({ label, href, active: key === active }))

// Client money is one place: what the client account holds and for whom, and the tenancy deposits.
export const clientMoneyTabs = (active: 'client' | 'deposits'): HeroTab[] =>
  ([['client', 'Client account', '/admin/client-money'], ['deposits', 'Tenancy deposits', '/admin/deposits']] as const).map(([key, label, href]) => ({ label, href, active: key === active }))

export const financeTabs = (active: string, month?: string): HeroTab[] =>
  TABS.map(([key, label, href]) => ({ label, href: href(month), active: key === active }))
