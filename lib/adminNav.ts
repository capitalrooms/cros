// Admin navigation — zones and their sub-pages. Shared by the desktop layout and the phone "More" screen.

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

export const ZONES: Zone[] = [
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
    label: 'Portfolio',
    home: '/admin/active-rooms',
    routes: ['/admin/active-rooms', '/admin/overview', '/admin/property-tasks', '/admin/properties/new'],
    subnav: [
      { emoji: '➕', label: 'Add Property',    href: '/admin/properties/new' },
      { emoji: '🏠', label: 'All Units',       href: '/admin/active-rooms' },
      { emoji: '🔍', label: 'Property Audit',  href: '/admin/overview' },
      { emoji: '📋', label: 'Property Tasks',  href: '/admin/property-tasks' },
    ],
  },
  {
    id: 'lettings',
    emoji: '🔑',
    label: 'Lettings',
    routes: [
      '/admin/available-and-lettings',
      '/admin/applicants',
      '/admin/invite-to-apply',
      '/admin/let-only',
      '/admin/let-only-properties',
      '/admin/bulk-tenancy-generator',
      '/admin/tenancies',
      '/admin/move-in',
      '/admin/tenancy-management',
      '/admin/rent-increase',
      '/admin/early-move-out',
      '/admin/rent-history',
    ],
    subnav: [
      { emoji: '👤', label: 'Applicants',         href: '/admin/applicants' },
      { emoji: '🔑', label: 'Available Rooms',    href: '/admin/available-and-lettings' },
      { emoji: '📄', label: 'Bulk Agreements',    href: '/admin/bulk-tenancy-generator' },
      { emoji: '📧', label: 'Invite to Apply',    href: '/admin/invite-to-apply' },
      { emoji: '🏘',  label: 'Let-Only',           href: '/admin/let-only-properties' },
      { emoji: '🔔', label: 'On Notice',          href: '/admin/tenancy-management' },
      { emoji: '📈', label: 'Rent Reviews',       href: '/admin/rent-increase' },
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
    ],
    subnav: [
      { emoji: '🧹', label: 'Cleaning',      href: '/admin/cleaner-jobs' },
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
      '/admin/inbox',
      '/admin/documents',
    ],
    subnav: [
      { emoji: '🤖', label: 'AI Doc Scanner',    href: '/admin/ai-upload' },
      { emoji: '📜', label: 'Certificates',      href: '/admin/compliance?tab=certificates' },
      { emoji: '📥', label: 'Doc Inbox',         href: '/admin/inbox' },
      { emoji: '📖', label: 'Inspection Logs',   href: '/admin/compliance-logs' },
      { emoji: '🛡', label: 'Safety Checks',     href: '/admin/compliance?tab=monthly-checks' },
      { emoji: '🔐', label: 'SAR Log',           href: '/admin/sar' },
      { emoji: '✉️', label: 'Send Certificates', href: '/admin/compliance/send-certificates' },
      { emoji: '📚', label: 'Tenant Guides',     href: '/admin/guides' },
    ],
  },
  {
    id: 'finance',
    emoji: '💰',
    label: 'Finance',
    home: '/admin/finance',
    routes: [
      '/admin/finance',
      '/admin/rent-roll',
      '/admin/payment-run',
      '/admin/accounts',
      '/admin/income',
      '/admin/expense-log',
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
    // the month's cycle first; everything else is under "Other tools" on Finance home
    subnav: [
      { emoji: '🏠', label: 'Finance Home',     href: '/admin/finance' },
      { emoji: '📋', label: 'Rent Roll',        href: '/admin/rent-roll' },
      { emoji: '🧾', label: 'Statements',       href: '/admin/statements' },
      { emoji: '💸', label: 'Payment Run',      href: '/admin/payment-run' },
      { emoji: '🏦', label: 'Bank & Matching',  href: '/admin/reconciliation' },
      { emoji: '💷', label: 'Expenses',         href: '/admin/expense-log' },
      { emoji: '⏰', label: 'Arrears',          href: '/admin/arrears' },
      { emoji: '🔐', label: 'Client Money',     href: '/admin/client-money' },
      { emoji: '🛡', label: 'Deposits',         href: '/admin/deposits' },
      { emoji: '📊', label: 'Reports',          href: '/admin/reports' },
    ],
  },
  {
    id: 'people',
    emoji: '👥',
    label: 'People',
    routes: ['/admin/people', '/admin/person', '/admin/contacts', '/admin/landlords'],
    subnav: [
      { emoji: '👷', label: 'Contractors',  href: '/admin/people?tab=contractors' },
      { emoji: '🤝', label: 'Landlords',    href: '/admin/people?tab=landlords' },
      { emoji: '👔', label: 'Staff',        href: '/admin/people?tab=staff' },
      { emoji: '👤', label: 'Tenants',      href: '/admin/people?tab=tenants' },
    ],
  },
  {
    id: 'comms',
    emoji: '💬',
    label: 'Comms',
    routes: [
      '/admin/communications',
      '/admin/document-generator',
      '/admin/notify',
      '/admin/message-templates',
      '/admin/acknowledgment-notes',
    ],
    subnav: [
      { emoji: '📝', label: 'Acknowledgments',   href: '/admin/acknowledgment-notes' },
      { emoji: '💬', label: 'All Messages',       href: '/admin/communications' },
      { emoji: '📄', label: 'Letters & Invoices', href: '/admin/document-generator' },
      { emoji: '📢', label: 'Quick Notify',      href: '/admin/notify' },
      { emoji: '✉️', label: 'Templates',         href: '/admin/message-templates' },
    ],
  },
  {
    id: 'biz',
    emoji: '📈',
    label: 'New Business',
    routes: ['/admin/new-business', '/admin/valuations'],
    subnav: [
      { emoji: '📈', label: 'Overview',           href: '/admin/new-business' },
      { emoji: '📝', label: 'Agreements',         href: '/admin/new-business/management-agreement' },
      { emoji: '✉️', label: 'Introduction Email', href: '/admin/new-business/acquisition' },
      { emoji: '➕', label: 'New Instruction',    href: '/admin/new-business/send-welcome' },
      { emoji: '🔍', label: 'Onboarding & AML',   href: '/admin/new-business/onboarding' },
      { emoji: '🏡', label: 'Valuations',         href: '/admin/valuations' },
    ],
  },
]

