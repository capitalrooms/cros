// Access levels for office staff (stage 2, 12 Oct 2026 — Harry: "assign individuals levels of access … only elected
// controls of what we have already built"). Each office person has a set of AREAS, following the rail. Administrators
// always have every area; everyone else has what Harry ticks on People › Office (people.access_areas), or their
// role's preset until he does. Used by:
//   proxy.ts           — every /api/admin/* request: the area it belongs to must be one of theirs (unmapped → administrators)
//   lib/adminAuth      — requireAdmin lets a non-administrator in for routes in their areas
//   app/admin/layout   — the rail shows only their areas; any other page shows "not part of your access"
// Safe to import in the browser (no server code).

export type AreaKey = 'dashboard' | 'properties' | 'lettings' | 'diary' | 'maintenance' | 'compliance' | 'finance' | 'people' | 'comms' | 'newbusiness' | 'website'

export interface Area { key: AreaKey; label: string; hint: string; pages: string[]; api: string[]; apiRead?: string[] }

// pages: /admin route prefixes; api: route prefixes (mostly /api/admin; a few office routes live elsewhere). A path belongs to the longest matching prefix.
// Not in any area (administrators only): Settings, accounts & access, view-as, export, business settings, brand logo,
// seeding — and anything added later until it's put in an area here.
export const AREAS: Area[] = [
  { key: 'dashboard', label: 'Dashboard', hint: 'The home screen figures and today’s list',
    pages: ['/admin/today', '/admin/search'], api: ['/api/admin/dashboard', '/api/admin/today', '/api/admin/search'] },
  { key: 'properties', label: 'Properties', hint: 'All Units, property pages, adding properties',
    pages: ['/admin/active-rooms', '/admin/overview', '/admin/property-tasks', '/admin/properties', '/admin/property-documents', '/admin/property-notes'],
    // (removing a property is administrators only — not in any area)
    api: ['/api/admin/property-tasks', '/api/admin/house-docs', '/api/admin/hmo-notice', '/api/admin/files',
      '/api/admin/ensure-storage', '/api/admin/create-property', '/api/admin/delete-photo', '/api/admin/house-info-extract', '/api/admin/property-insights',
      '/api/admin/property-policies', '/api/admin/upload-photo', '/api/admin/key-safe'] },
  { key: 'lettings', label: 'Lettings', hint: 'Available rooms, applicants, offers, let-only houses, agreements, tenancies',
    // tenant and landlord profiles and letters too: the letting file links to them (they're also in People / Comms)
    pages: ['/admin/lettings', '/admin/available-and-lettings', '/admin/applicants', '/admin/invite-to-apply', '/admin/let-only', '/admin/let-only-properties', '/admin/tenant',
      '/admin/landlord', '/admin/document-generator',
      '/admin/bulk-tenancy-generator', '/admin/tenancies', '/admin/move-in', '/admin/tenancy-management', '/admin/rent-increase', '/admin/early-move-out', '/admin/rent-history', '/admin/voids'],
    api: ['/api/admin/lettings', '/api/admin/let-only', '/api/admin/bulk-tenancy-generator', '/api/admin/move-in', '/api/admin/tenancies', '/api/admin/rent-reviews', '/api/admin/voids',
      '/api/admin/landlord-invoice', '/api/admin/upload-applicant-document', '/api/admin/quick-notify-lettings', '/api/emails/checkout-preview',
      // what lettings work reaches into (12 Oct 2026 check): holding deposit receipts, landlords' bank details on agreements, letters
      '/api/admin/documents/generated', '/api/admin/document-generator'],
    // read only (GET): landlords' bank details for agreements — changing where a landlord is paid stays with Finance
    apiRead: ['/api/admin/landlord-bank-accounts'] },
  { key: 'diary', label: 'Diary & viewings', hint: 'The diary, booking viewings and appointments',
    pages: ['/admin/appointments', '/admin/agency-diary', '/admin/calendar'], api: ['/api/admin/appointments', '/api/admin/calendar'] },
  { key: 'maintenance', label: 'Maintenance', hint: 'Repairs, contractors, quotes, cleaning, emergencies, planner',
    pages: ['/admin/maintenance', '/admin/cleaner-jobs', '/admin/emergencies', '/admin/planner', '/admin/contractor'],
    api: ['/api/admin/maintenance', '/api/admin/quotes', '/api/admin/emergencies', '/api/admin/planner', '/api/admin/cleaner', '/api/admin/jobs', '/api/admin/visit-requests'] },
  { key: 'compliance', label: 'Compliance & documents', hint: 'Certificates, safety checks, document inbox and scanner, guides',
    pages: ['/admin/compliance', '/admin/compliance-logs', '/admin/property-compliance-dashboard', '/admin/tenant-safety-checks', '/admin/sar', '/admin/guides',
      '/admin/ai-upload', '/admin/capture', '/admin/inbox', '/admin/documents'],
    api: ['/api/admin/compliance', '/api/admin/compliance-history', '/api/admin/capture', '/api/admin/inbox', '/api/admin/documents', '/api/admin/guides', '/api/admin/send-certs', '/api/ai/scan-cert-dates', '/api/inbox'] },
  { key: 'finance', label: 'Finance', hint: 'Rent roll, statements, payments, bank, expenses, deposits, reports',
    pages: ['/admin/finance', '/admin/money', '/admin/supplier-invoices', '/admin/rent-roll', '/admin/payment-run', '/admin/accounts', '/admin/income', '/admin/expense-log',
      '/admin/ops-account', '/admin/expense-review', '/admin/statements', '/admin/autoledger', '/admin/reconciliation', '/admin/bank-import', '/admin/rent-charges',
      '/admin/arrears', '/admin/client-money', '/admin/deposits', '/admin/finance-check', '/admin/payouts', '/admin/reports'],
    api: ['/api/admin/finance', '/api/admin/money', '/api/admin/supplier-invoices', '/api/admin/rent-roll', '/api/admin/payment-run', '/api/admin/expenses', '/api/admin/expense',
      '/api/admin/ops-account', '/api/admin/statements', '/api/admin/statement-line-items', '/api/admin/reconciliation', '/api/admin/bank-import', '/api/admin/rent-charges',
      '/api/admin/arrears', '/api/admin/rent-reminders', '/api/admin/client-money', '/api/admin/deposits', '/api/admin/deposit-returns', '/api/admin/payouts', '/api/admin/reports', '/api/admin/landlord-statement',
      '/api/admin/landlord-bank-accounts', '/api/admin/payment-audit-log', '/api/admin/financial-trail', '/api/admin/categorise-expense', '/api/admin/finance-check',
      '/api/admin/finance-home', '/api/admin/rent-resolve', '/api/admin/expense-statement-pdf', '/api/admin/send-expense-report', '/api/admin/arrears-letter', '/api/accounts', '/api/statements', '/api/ai/extract-statement'] },
  { key: 'people', label: 'People', hint: 'Tenants, landlords, contractors and cleaners (not office accounts)',
    pages: ['/admin/people', '/admin/person', '/admin/contacts', '/admin/landlords', '/admin/tenant', '/admin/landlord'], api: ['/api/admin/people'] },
  { key: 'comms', label: 'Comms', hint: 'Messages, letters & invoices, quick notify, templates',
    pages: ['/admin/communications', '/admin/document-generator', '/admin/notify', '/admin/message-templates', '/admin/acknowledgment-notes', '/admin/feedback'],
    api: ['/api/admin/notify', '/api/admin/message-templates', '/api/admin/communications', '/api/admin/document-generator', '/api/admin/letters', '/api/admin/quick-notify',
      '/api/admin/notices', '/api/admin/feedback', '/api/admin/letter-templates'] },
  { key: 'website', label: 'Website', hint: 'Advice posts, which rooms the website shows, footer documents',
    pages: ['/admin/website'], api: ['/api/admin/website'] },
  { key: 'newbusiness', label: 'New business', hint: 'Agreements, introductions, onboarding & AML, valuations',
    pages: ['/admin/new-business', '/admin/valuations'],
    api: ['/api/admin/new-business', '/api/admin/valuations', '/api/admin/management-agreements', '/api/admin/generate-management-agreement', '/api/landlord-onboarding', '/api/aml-report', '/api/landlord-aml-refresh', '/api/landlord-acquisition'] },
]

export const ALL_AREAS = AREAS.map(a => a.key)

/** What each role has until Harry ticks something different for the person. */
export const ROLE_PRESETS: Record<string, AreaKey[]> = {
  administrator: ALL_AREAS,
  admin: ALL_AREAS,
  lettings: ['lettings', 'diary', 'properties'],   // properties: rooms, photos and let-only houses are lettings work
}

/** Two-step sign-in compulsory for administrators? Off by Harry's choice (14 Oct 2026: "one password fine — the app
 *  itself needs to be secure, not user logins"). Two-step (Face ID or an app) stays available to everyone on /account,
 *  and new-device sign-ins email the account owner (app/api/auth/sign-in-alert). Turn this on to require it again —
 *  then also run migration 222 for the database. */
export const REQUIRE_TWO_STEP_FOR_ADMINS = false

export const OFFICE_ROLES = ['administrator', 'admin', 'lettings']
export const isOfficeRole = (role: string | null | undefined) => OFFICE_ROLES.includes(role ?? '')
export const isAdministrator = (role: string | null | undefined) => role === 'administrator' || role === 'admin'

/** A person's areas: administrators everything; otherwise what was ticked, else the role preset. */
export function areasFor(role: string | null | undefined, ticked: string[] | null | undefined): AreaKey[] {
  if (isAdministrator(role)) return ALL_AREAS
  if (!isOfficeRole(role)) return []
  if (Array.isArray(ticked)) return ticked.filter((k): k is AreaKey => (ALL_AREAS as string[]).includes(k))
  return ROLE_PRESETS[role ?? ''] ?? []
}

const longest = (path: string, pick: (a: Area) => string[]) => {
  let best: { key: AreaKey; len: number } | null = null
  for (const a of AREAS) for (const p of pick(a)) if ((path === p || path.startsWith(p + '/')) && (!best || p.length > best.len)) best = { key: a.key, len: p.length }
  return best?.key ?? null
}

/** The areas a path is part of (a page can be in more than one, e.g. tenant profiles: Lettings and People). */
const areasOf = (path: string, pick: (a: Area) => string[]) =>
  AREAS.filter(a => pick(a).some(p => path === p || path.startsWith(p + '/'))).map(a => a.key)

/** The area an office page belongs to; '/admin' itself is the dashboard; null = administrators only (Settings etc.). */
export function areaOfPage(pathname: string): AreaKey | null {
  if (pathname === '/admin' || pathname === '/admin/') return 'dashboard'
  if (pathname === '/admin/profile' || pathname.startsWith('/admin/profile/')) return null   // everyone may open their own profile — handled by canOpenPage
  return longest(pathname, a => a.pages)
}

/** The area an /api/admin route belongs to; null = administrators only. */
export const areaOfApi = (pathname: string): AreaKey | null => longest(pathname, a => a.api)

/** Pages every office person may open, whatever their areas. */
const OPEN_TO_OFFICE = ['/admin/profile', '/admin/settings/signatures', '/admin/more']   // More = the phone menu; it lists only their pages
export function canOpenPage(pathname: string, areas: AreaKey[], role: string | null | undefined): boolean {
  if (isAdministrator(role)) return true
  if (OPEN_TO_OFFICE.some(p => pathname === p || pathname.startsWith(p + '/'))) return true
  if (pathname === '/admin' || pathname === '/admin/') return areas.includes('dashboard')
  return areasOf(pathname, a => a.pages).some(k => areas.includes(k))
}

/** API routes every office person may call: their own profile and signature, opening and uploading documents (used
 *  on many screens, e.g. the letting file), and the Export button on every list (it exports what they can see). */
const API_OPEN_TO_OFFICE = ['/api/admin/profile', '/api/admin/upload-signature', '/api/admin/files/sign', '/api/storage/presign-upload',
  '/api/admin/upload-property-document', '/api/admin/verify-upload', '/api/admin/export/pdf']

/** /api/admin routes anyone may call, signed in or not: the address finder on public forms (landlord onboarding). */
export const PUBLIC_API = ['/api/admin/postcode-lookup']
export const isPublicApi = (pathname: string) => PUBLIC_API.some(p => pathname === p || pathname.startsWith(p + '/'))
export function canCallApi(pathname: string, areas: AreaKey[], role: string | null | undefined, method = 'GET'): boolean {
  if (isAdministrator(role)) return true
  if (API_OPEN_TO_OFFICE.some(p => pathname === p || pathname.startsWith(p + '/'))) return true
  if (areasOf(pathname, a => a.api).some(k => areas.includes(k))) return true
  return method.toUpperCase() === 'GET' && areasOf(pathname, a => a.apiRead ?? []).some(k => areas.includes(k))
}

/** Where someone lands in the office app: the dashboard if they have it, else their first area's first page. */
export function homeFor(areas: AreaKey[]): string {
  if (areas.includes('dashboard')) return '/admin'
  const first = AREAS.find(a => areas.includes(a.key))
  return first ? first.pages[0] : '/account'
}
