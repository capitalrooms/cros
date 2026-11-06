// Every kind of email CROS sends, by who gets it (6 Nov 2026 — the Email hub, /admin/email-hub). Taken from the 114
// places in the code that send email. `own: true` = that email names itself when it's built (buildEmail/sendEmail
// `kind`), so the hub can give it its own theme; the rest follow the theme for all emails until they're moved across.
// Keys are stable — never reuse one for a different email.

export type Audience = 'Tenants' | 'Applicants' | 'Landlords' | 'Contractors & suppliers' | 'Cleaners' | 'Office'
export interface EmailKind { key: string; name: string; audience: Audience; when: string; own?: boolean }

export const EMAIL_KINDS: EmailKind[] = [
  // ── applicants ──
  { key: 'invite-to-apply', name: 'Invitation to apply', audience: 'Applicants', when: 'After a viewing, when you invite them to apply' },
  { key: 'offer-letter', name: 'Offer letter', audience: 'Applicants', when: 'When you accept their offer' },
  { key: 'search-is-over', name: '“The search is over” — reserve the room', audience: 'Applicants', when: 'When you ask for the holding deposit' },
  { key: 'holding-deposit', name: 'Holding deposit received', audience: 'Applicants', when: 'When the holding deposit is recorded' },
  { key: 'application-declined', name: 'Application not taken forward', audience: 'Applicants', when: 'When you decline an application' },
  { key: 'viewing-booked', name: 'Viewing booked', audience: 'Applicants', when: 'When a viewing is booked' },
  { key: 'move-in-pack', name: 'Move-in pack', audience: 'Applicants', when: 'When you send the documents before signing' },
  // ── tenants ──
  { key: 'tenant-welcome', name: 'Welcome — set up your account', audience: 'Tenants', when: 'When a tenant is invited to the app' },
  { key: 'rent-due', name: 'Rent reminders', audience: 'Tenants', when: 'Before rent is due, and when it’s late' },
  { key: 'rent-increase', name: 'Section 13 rent increase notice', audience: 'Tenants', when: 'When you serve a rent increase' },
  { key: 'prescribed-info', name: 'Deposit prescribed information', audience: 'Tenants', when: 'When the deposit is protected' },
  { key: 'house-docs', name: 'House documents (certificates, house guide)', audience: 'Tenants', when: 'When you send the house’s documents' },
  { key: 'visit-booked', name: 'Repair visit booked', audience: 'Tenants', when: 'When a contractor’s date is set' },
  { key: 'job-raised', name: 'Repair reported', audience: 'Tenants', when: 'When a repair is logged' },
  { key: 'job-completed', name: 'Repair completed', audience: 'Tenants', when: 'When a job is signed off' },
  { key: 'cleaning-update', name: 'Cleaning updates', audience: 'Tenants', when: 'When the cleaner reports on the house' },
  { key: 'housemate-intro', name: 'Meet your new housemate', audience: 'Tenants', when: 'When a new tenant has said hello (managed houses)', own: true },
  { key: 'notice-received', name: 'Notice received', audience: 'Tenants', when: 'When a tenant gives notice' },
  { key: 'move-out', name: 'Your move-out', audience: 'Tenants', when: 'When a move-out is confirmed, and the reminder before it' },
  { key: 'quick-message', name: 'Messages from the office', audience: 'Tenants', when: 'Quick Notify and messages you write' },
  // ── landlords ──
  { key: 'landlord-update-offer', name: 'Offer to review', audience: 'Landlords', when: 'Before you accept an offer', own: true },
  { key: 'landlord-update-reserved', name: 'Room reserved', audience: 'Landlords', when: 'When the holding deposit is in', own: true },
  { key: 'landlord-update-referenced', name: 'References passed', audience: 'Landlords', when: 'When referencing passes', own: true },
  { key: 'landlord-update-signed_paid', name: 'New let — signed & paid', audience: 'Landlords', when: 'When it’s signed and the money’s in', own: true },
  { key: 'landlord-update-summary', name: 'New tenant report', audience: 'Landlords', when: 'Everything so far, in one', own: true },
  { key: 'landlord-update-housemate', name: 'Meet your new housemate (to forward)', audience: 'Landlords', when: 'When the tenant has said hello (let only)', own: true },
  { key: 'landlord-statement', name: 'Monthly statement', audience: 'Landlords', when: 'When you send a landlord statement' },
  { key: 'landlord-invite', name: 'Welcome — set up your account', audience: 'Landlords', when: 'When a landlord is invited to the app' },
  { key: 'landlord-onboarding', name: 'Registration and onboarding', audience: 'Landlords', when: 'Onboarding form, follow-ups, approval' },
  { key: 'management-agreement', name: 'Management agreement', audience: 'Landlords', when: 'When you send an agreement to sign' },
  { key: 'compliance-certs', name: 'Compliance certificates', audience: 'Landlords', when: 'When you send a house’s certificates' },
  { key: 'expense-report', name: 'Recharged expenses', audience: 'Landlords', when: 'Monthly expenses report' },
  { key: 'landlord-acquisition', name: 'New business introduction', audience: 'Landlords', when: 'Prospective landlords' },
  { key: 'hmo-notice', name: 'HMO licence notice', audience: 'Landlords', when: 'When an HMO licence notice goes out' },
  // ── contractors & suppliers ──
  { key: 'job-to-contractor', name: 'New job', audience: 'Contractors & suppliers', when: 'When a job is sent to a contractor' },
  { key: 'job-chase', name: 'Job chase', audience: 'Contractors & suppliers', when: 'When a job is overdue' },
  { key: 'quote-request', name: 'Request for quotation', audience: 'Contractors & suppliers', when: 'When you ask for quotes' },
  { key: 'booking-link', name: 'Book your visit', audience: 'Contractors & suppliers', when: 'When a contractor picks a slot' },
  { key: 'supplier-cert', name: 'Certificate request', audience: 'Contractors & suppliers', when: 'When a certificate is due' },
  { key: 'project-brief', name: 'Project brief', audience: 'Contractors & suppliers', when: 'From the planner' },
  // ── cleaners ──
  { key: 'cleaner-nudge', name: 'Cleans needing a look', audience: 'Cleaners', when: 'Daily, when cleans are late or missed' },
  // ── office ──
  { key: 'office-new-offer', name: 'New offer / application', audience: 'Office', when: 'When an applicant applies' },
  { key: 'office-deposit-paid', name: 'Holding deposit paid', audience: 'Office', when: 'When an applicant says they’ve paid' },
  { key: 'office-sign-in-alert', name: 'New device sign-in', audience: 'Office', when: 'When an office login is used on a new device' },
  { key: 'office-texts', name: 'Texts received', audience: 'Office', when: 'When a tenant replies by text' },
  { key: 'office-inbound', name: 'Documents received', audience: 'Office', when: 'When documents are emailed in' },
]
export const AUDIENCES: Audience[] = ['Tenants', 'Applicants', 'Landlords', 'Contractors & suppliers', 'Cleaners', 'Office']
export const kindByKey = (k: string) => EMAIL_KINDS.find(x => x.key === k)
