// Admin navigation — zones and their sub-pages. Shared by the desktop layout and the phone "More" screen.
import { CROS_COLLECTS_RENT } from '@/lib/finance/mode'

// ─── Zone & subnav configuration ────────────────────────────────────────────

export interface SubItem {
  emoji: string
  label: string
  href: string
  badge?: 'red' | 'amber' | 'green'
}

export interface Zone {
  id: string
  emoji: string
  label: string
  // Where clicking the zone goes (defaults to the first subnav item)
  home?: string
  // Route prefixes that belong to this zone (checked in order)
  routes: string[]
  subnav: SubItem[]
}

const ZONES_AS_WRITTEN: Zone[] = [
  {
    id: 'dash',
    emoji: '🏠',
    label: 'Dashboard',
    routes: ['/admin'],   // exact match handled separately
    subnav: [],           // dashboard has no subnav — full width
  },
  {
    id: 'portfolio',
    emoji: '🏢',
    label: 'Properties',
    home: '/admin/active-rooms',
    // Property Audit (/admin/overview) and Property Tasks (/admin/property-tasks) left the menu 8 Oct 2026: the Dashboard
    // covers the audit's figures, Compliance the certificate deadlines, and no task had ever been made. Pages still open by link.
    routes: ['/admin/active-rooms', '/admin/overview', '/admin/property-tasks', '/admin/properties/new', '/admin/bills-and-services'],
    subnav: [
      { emoji: '🏠', label: 'All Properties',  href: '/admin/active-rooms' },
      { emoji: '🧾', label: 'Bills & Services', href: '/admin/bills-and-services' },   // every account at every house (migration 264)
    ],
  },
  {
    id: 'lettings',
    emoji: '🔑',
    label: 'Lettings',
    home: '/admin/lettings',
    routes: [
      '/admin/available-and-lettings',
      '/admin/applicants',
      '/admin/invite-to-apply',
      '/admin/let-only',
      '/admin/let-only-properties',
      '/admin/bulk-tenancy-generator',
      '/admin/tenancies',
      '/admin/lettings',
      '/admin/market',
      '/admin/move-in',
      '/admin/tenancy-management',
      '/admin/rent-increase',
      '/admin/early-move-out',
      '/admin/rent-history',
      '/admin/voids',
    ],
    subnav: [
      { emoji: '🧭', label: 'Overview',           href: '/admin/lettings' },
      { emoji: '👤', label: 'Applicants',         href: '/admin/applicants' },
      { emoji: '🔑', label: 'Availability',       href: '/admin/available-and-lettings' },
      { emoji: '📄', label: 'Bulk Agreements',    href: '/admin/bulk-tenancy-generator' },
      { emoji: '📅', label: 'Diary',              href: '/admin/agency-diary' },   // viewings with everything else (12 Nov 2026)
      { emoji: '📈', label: 'Market',             href: '/admin/market' },         // rents and prices by area (12 Nov 2026)
      { emoji: '🤝', label: 'Tenancies',          href: '/admin/tenancies' },
    ],
  },
  {
    id: 'ops',
    emoji: '🔧',
    label: 'Management',
    routes: [
      '/admin/appointments',
      '/admin/agency-diary',
      '/admin/calendar',
      '/admin/planner',
      '/admin/maintenance',
      '/admin/cleaner-jobs',
      '/admin/emergencies',
    ],
    subnav: [
      { emoji: '🧹', label: 'Cleaning',      href: '/admin/cleaner-jobs' },
      { emoji: '🚨', label: 'Emergencies',   href: '/admin/emergencies' },
      { emoji: '📅', label: 'Diary',         href: '/admin/appointments' },
      { emoji: '🔧', label: 'Maintenance',   href: '/admin/maintenance' },
      { emoji: '🗂️', label: 'Planner',       href: '/admin/planner' },
    ],
  },
  {
    id: 'compliance',
    emoji: '✅',
    label: 'Compliance',
    routes: [
      '/admin/compliance',
      '/admin/compliance-logs',
      '/admin/property-compliance-dashboard',
      '/admin/tenant-safety-checks',
      '/admin/sar',
      '/admin/guides',
      '/admin/ai-upload',
      '/admin/capture',
      '/admin/inbox',
      '/admin/documents',
    ],
    subnav: [
      { emoji: '📄', label: 'Documents',         href: '/admin/capture' },   // Capture · Scan & file · Emailed in · Library (3 Nov 2026)
      { emoji: '📜', label: 'Certificates & Checks', href: '/admin/compliance?tab=certificates' },   // Certificates · Safety checks · Send certificates
      { emoji: '🔐', label: 'SAR Log',           href: '/admin/sar' },
      { emoji: '📚', label: 'Tenant Guides',     href: '/admin/guides' },
    ],
  },
  {
    id: 'finance',
    emoji: '💰',
    label: 'Finance',
    home: '/admin/finance',
    routes: [
      '/admin/supplier-invoices',
      '/admin/books',
      '/admin/finance',
      '/admin/rent-roll',
      '/admin/payment-run',
      '/admin/accounts',
      '/admin/income',
      '/admin/company-pnl',
      '/admin/expense-log',
      '/admin/ops-account',
      '/admin/expense-review',
      '/admin/statements',
      '/admin/autoledger',
      '/admin/reconciliation',
      '/admin/bank-import',
      '/admin/rent-charges',
      '/admin/arrears',
      '/admin/client-money',
      '/admin/deposits',
      '/admin/finance-check',
      '/admin/payouts',
      '/admin/reports',
    ],
    // Import mode (now — the old system collects rent and makes statements, CROS takes them in) shows only what's used;
    // Pay mode (CROS_COLLECTS_RENT, later) adds the rent roll, payment run, arrears and client money (13 Nov 2026 tidy)
    subnav: CROS_COLLECTS_RENT ? [
      { emoji: '🏠', label: 'Finance Home',     href: '/admin/finance' },
      { emoji: '📋', label: 'Rent Roll',        href: '/admin/rent-roll' },
      { emoji: '🧾', label: 'Statements',       href: '/admin/statements' },
      { emoji: '💸', label: 'Payment Run',      href: '/admin/payment-run' },
      { emoji: '🏦', label: 'Bank',             href: '/admin/bank-calendar' },
      { emoji: '📒', label: 'Transactions',     href: '/admin/books' },
      { emoji: '🧮', label: 'VAT',              href: '/admin/books/vat' },
      { emoji: '💷', label: 'Expenses',         href: '/admin/expense-log' },
      { emoji: '💰', label: 'Agency Income',    href: '/admin/income' },
      { emoji: '⏰', label: 'Rent Arrears',     href: '/admin/rents-due' },
      { emoji: '🔐', label: 'Client Money',     href: '/admin/client-money' },
      { emoji: '📊', label: 'Reports',          href: '/admin/reports' },
    ] : [
      { emoji: '🏠', label: 'Finance Home',     href: '/admin/finance' },
      { emoji: '📥', label: 'Statements In',    href: '/admin/statements/review' },   // what arrived at statements@ — check against the PDF
      { emoji: '🧾', label: 'Statements',       href: '/admin/statements' },          // the record, by landlord and month
      { emoji: '💷', label: 'Expenses',         href: '/admin/expense-log' },
      { emoji: '📒', label: 'Transactions',     href: '/admin/books' },
      { emoji: '🧮', label: 'VAT',              href: '/admin/books/vat' },
      { emoji: '💰', label: 'Agency Income',    href: '/admin/income' },
      { emoji: '🏦', label: 'Bank & Deposits',  href: '/admin/bank-calendar' },
      { emoji: '📊', label: 'Reports',          href: '/admin/reports' },
    ],
  },
  {
    id: 'people',
    emoji: '👥',
    label: 'People',
    routes: ['/admin/people', '/admin/person', '/admin/contacts', '/admin/landlords', '/admin/tenant', '/admin/landlord', '/admin/contractor'],
    subnav: [
      { emoji: '👤', label: 'Tenants',      href: '/admin/people?tab=tenants' },
      { emoji: '👷', label: 'Contractors',  href: '/admin/people?tab=contractors' },
      { emoji: '🧹', label: 'Cleaners',     href: '/admin/people?tab=cleaners' },
      { emoji: '🤝', label: 'Landlords',    href: '/admin/people?tab=landlords' },
      { emoji: '👔', label: 'Office',       href: '/admin/people?tab=office' },
    ],
  },
  {
    id: 'comms',
    emoji: '💬',
    label: 'Communications',
    home: '/admin/communications',
    routes: [
      '/admin/communications',
      '/admin/document-generator',
      '/admin/notify',
      '/admin/message-templates',
      '/admin/acknowledgment-notes',
      '/admin/feedback',
      '/admin/email-hub',
      '/admin/publish',
    ],
    subnav: [
      { emoji: '💬', label: 'Messages',           href: '/admin/communications' },   // All · Send to a house · Acknowledgments · Feedback · Templates
      { emoji: '📄', label: 'Letters & Invoices', href: '/admin/document-generator' },
      { emoji: '✉️', label: 'Email hub',          href: '/admin/email-hub' },   // themes for every email (lib/email/themes) — administrators
      { emoji: '📣', label: 'Publish',            href: '/admin/publish' },   // write once → email, PDF letter, text, app, website, social (13 Nov 2026)
    ],
  },
  {
    id: 'website',
    emoji: '🌐',
    label: 'Website',
    home: '/admin/website',
    routes: ['/admin/website'],
    subnav: [
      { emoji: '🌐', label: 'Website',      href: '/admin/website?tab=rooms' },   // Rooms · Advice posts · Documents tabs
    ],
  },
  {
    id: 'biz',
    emoji: '📈',
    label: 'New Business',
    routes: ['/admin/new-business', '/admin/valuations'],
    subnav: [
      { emoji: '📈', label: 'Pipeline',           href: '/admin/new-business' },   // Overview · Introduction · Valuations · Instruction · Onboarding & AML · Agreements
    ],
  },
]

/**
 * What the rail shows: Dashboard first, then every zone — and every list of pages inside a zone — in
 * alphabetical order. Sorted here, in code, so adding a page can never put a list out of order (Harry's rule).
 */
const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
export const ZONES: Zone[] = [
  ...ZONES_AS_WRITTEN.filter(z => z.id === 'dash'),
  ...ZONES_AS_WRITTEN.filter(z => z.id !== 'dash').sort(byLabel),
].map(z => ({ ...z, subnav: [...z.subnav].sort(byLabel) }))
