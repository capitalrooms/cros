// Every kind of email CROS sends, by who gets it (6 Nov 2026 — the Email hub, /admin/email-hub). Taken from the 114
// places in the code that send email. Every one names itself when it's built (buildEmail/sendEmail `kind`) — scripts/check-email-kinds.mjs
// refuses a deploy otherwise — so each can have its own theme on the hub.
// Keys are stable — never reuse one for a different email.

export type Audience = 'Tenants' | 'Applicants' | 'Landlords' | 'Contractors & suppliers' | 'Cleaners' | 'Office' | 'Everyone'
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
  { key: 'job-on-hold', name: 'Repair on hold', audience: 'Tenants', when: 'When a job is paused' },
  { key: 'tenant-viewing-notice', name: 'Viewing at your home', audience: 'Tenants', when: 'When a viewing is booked at their house' },
  { key: 'appointment-booked', name: 'Appointment at your home', audience: 'Tenants', when: 'When a utility or third-party visit is booked' },
  { key: 'cleaning-update', name: 'Cleaning updates', audience: 'Tenants', when: 'When the cleaner reports on the house' },
  { key: 'housemate-intro', name: 'Meet your new housemate', audience: 'Tenants', when: 'When a new tenant has said hello (managed houses)', own: true },
  { key: 'notice-received', name: 'Notice received', audience: 'Tenants', when: 'When a tenant gives notice' },
  { key: 'move-out', name: 'Your move-out', audience: 'Tenants', when: 'When a move-out is confirmed, and the reminder before it' },
  { key: 'quick-message', name: 'Messages from the office', audience: 'Tenants', when: 'Quick Notify and messages you write' },
  { key: 'tenancy-agreement', name: 'Tenancy agreement to sign', audience: 'Tenants', when: 'When agreements are sent from Bulk Agreements' },
  { key: 'deposit-receipt', name: 'Deposit receipt', audience: 'Tenants', when: 'When a tenancy deposit is received' },
  { key: 'move-in-receipt', name: 'Move-in money receipt', audience: 'Tenants', when: 'When the money before move-in is received' },
  { key: 'hmo-notice', name: 'HMO licence notice', audience: 'Tenants', when: 'When an HMO licence notice goes out' },
  // ── landlords ──
  { key: 'landlord-update-offer', name: 'Offer to review', audience: 'Landlords', when: 'Before you accept an offer', own: true },
  { key: 'landlord-update-reserved', name: 'Room reserved', audience: 'Landlords', when: 'When the holding deposit is in', own: true },
  { key: 'landlord-update-referenced', name: 'References passed', audience: 'Landlords', when: 'When referencing passes', own: true },
  { key: 'landlord-update-signed_paid', name: 'New let — signed & paid', audience: 'Landlords', when: 'When it’s signed and the money’s in', own: true },
  { key: 'landlord-update-summary', name: 'New tenant report', audience: 'Landlords', when: 'Everything so far, in one', own: true },
  { key: 'landlord-update-housemate', name: 'Meet your new housemate (to forward)', audience: 'Landlords', when: 'When the tenant has said hello (let only)', own: true },
  { key: 'landlord-statement', name: 'Monthly statement', audience: 'Landlords', when: 'When you send a landlord statement' },
  { key: 'landlord-new-application', name: 'New application to look at', audience: 'Landlords', when: 'When you forward an application' },
  { key: 'landlord-invite', name: 'Welcome — set up your account', audience: 'Landlords', when: 'When a landlord is invited to the app' },
  { key: 'landlord-onboarding', name: 'Registration and onboarding', audience: 'Landlords', when: 'Onboarding form, follow-ups, approval' },
  { key: 'management-agreement', name: 'Management agreement', audience: 'Landlords', when: 'When you send an agreement to sign' },
  { key: 'compliance-certs', name: 'Compliance certificates', audience: 'Landlords', when: 'When you send a house’s certificates' },
  { key: 'landlord-acquisition', name: 'New business introduction', audience: 'Landlords', when: 'Prospective landlords' },
  { key: 'landlord-aml-refresh', name: 'Identity check refresh', audience: 'Landlords', when: 'When a landlord’s ID checks need renewing' },
  { key: 'let-only-viewing', name: 'Viewing updates to the landlord’s contacts', audience: 'Landlords', when: 'Let-only houses: viewings booked, moved or cancelled' },
  { key: 'planner-shared', name: 'Shared planner', audience: 'Landlords', when: 'When you share a project planner' },
  // ── contractors & suppliers ──
  { key: 'job-to-contractor', name: 'New job', audience: 'Contractors & suppliers', when: 'When a job is sent to a contractor' },
  { key: 'job-chase', name: 'Job chase', audience: 'Contractors & suppliers', when: 'When a job is overdue' },
  { key: 'quote-request', name: 'Request for quotation', audience: 'Contractors & suppliers', when: 'When you ask for quotes' },
  { key: 'booking-link', name: 'Book your visit', audience: 'Contractors & suppliers', when: 'When a contractor picks a slot' },
  { key: 'supplier-cert', name: 'Certificate request', audience: 'Contractors & suppliers', when: 'When a certificate is due' },
  { key: 'project-brief', name: 'Project brief', audience: 'Contractors & suppliers', when: 'From the planner' },
  { key: 'quote-accepted', name: 'Quote accepted — book a date', audience: 'Contractors & suppliers', when: 'When you accept a quote' },
  { key: 'quote-declined', name: 'Quote not taken forward', audience: 'Contractors & suppliers', when: 'When another quote is chosen' },
  { key: 'contractor-message', name: 'Messages to contractors', audience: 'Contractors & suppliers', when: 'Job updates and messages' },
  { key: 'supplier-job', name: 'Job for a supplier', audience: 'Contractors & suppliers', when: 'When a house task is emailed to a supplier' },
  { key: 'supplier-invoice', name: 'Supplier invoice', audience: 'Contractors & suppliers', when: 'When a contractor’s or cleaner’s invoice is sent' },
  // ── cleaners ──
  { key: 'cleaner-checkout', name: 'Move-out clean booked', audience: 'Cleaners', when: 'When a tenant is put on notice' },
  // ── office ──
  { key: 'office-new-offer', name: 'New offer / application', audience: 'Office', when: 'When an applicant applies' },
  { key: 'office-deposit-paid', name: 'Holding deposit paid', audience: 'Office', when: 'When an applicant says they’ve paid' },
  { key: 'office-sign-in-alert', name: 'New device sign-in', audience: 'Office', when: 'When an office login is used on a new device' },
  { key: 'office-texts', name: 'Texts received', audience: 'Office', when: 'When a tenant replies by text' },
  { key: 'office-inbound', name: 'Documents received', audience: 'Office', when: 'When documents are emailed in' },
  { key: 'cleaner-nudge', name: 'Cleans needing a look', audience: 'Office', when: 'Daily, when cleans are late or missed' },
  { key: 'office-expense-report', name: 'Recharged expenses report', audience: 'Office', when: 'Monthly, to accounts' },
  { key: 'office-agreement-confirmed', name: 'Management agreement confirmed', audience: 'Office', when: 'When a landlord confirms their agreement' },
  { key: 'office-quote-received', name: 'Quote received', audience: 'Office', when: 'When a contractor prices a job' },
  { key: 'office-notice-given', name: 'Notice given or withdrawn', audience: 'Office', when: 'When a tenant gives or rescinds notice in the app' },
  { key: 'office-move-out-form', name: 'Move-out form received', audience: 'Office', when: 'When a tenant sends their move-out form' },
  { key: 'office-pack-confirmed', name: 'Move-in pack confirmed', audience: 'Office', when: 'When a tenant says they’ve read their documents' },
  { key: 'office-autoledger', name: 'AutoLedger imports', audience: 'Office', when: 'When statements or expenses are emailed in' },
  { key: 'office-aml-review', name: 'Landlord ID check to review', audience: 'Office', when: 'When a landlord’s onboarding form comes in' },
  { key: 'office-landlord-answer', name: 'Landlord answered an offer', audience: 'Office', when: 'When a landlord approves or declines an applicant' },
  { key: 'office-visit-booked', name: 'Visit booked', audience: 'Office', when: 'When a contractor books a visit' },
  { key: 'office-repairs', name: 'Repair updates', audience: 'Office', when: 'When a repair is reported or completed' },
  { key: 'office-viewings', name: 'Viewing booked', audience: 'Office', when: 'When a viewing is scheduled' },
  { key: 'office-counter-offer', name: 'Counter-offer matched', audience: 'Office', when: 'When an applicant matches the asking rent' },
  // ── everyone ──
  { key: 'account-setup', name: 'Set up your account', audience: 'Everyone', when: 'When anyone is given a login' },
  { key: 'password-reset', name: 'Reset your password', audience: 'Everyone', when: 'When a password reset is asked for' },
  { key: 'sign-in-link', name: 'Sign-in link', audience: 'Everyone', when: 'When someone asks for a link to sign in' },
  { key: 'letter', name: 'Letters & invoices', audience: 'Everyone', when: 'From Letters & Invoices' },
  { key: 'calendar-invite', name: 'Calendar invitation', audience: 'Everyone', when: 'When you send a calendar invite' },
  { key: 'app-notification', name: 'Notifications from the app', audience: 'Everyone', when: 'When someone gets an alert in the app (also by email)' },
]
export const AUDIENCES: Audience[] = ['Tenants', 'Applicants', 'Landlords', 'Contractors & suppliers', 'Cleaners', 'Office', 'Everyone']
export const kindByKey = (k: string) => EMAIL_KINDS.find(x => x.key === k)
