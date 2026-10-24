// How long we tell a tenant a repair can take (21 Oct 2026, Harry: "for most low risk or not that important stuff
// they get a message saying please allow us up to 10 days … once we confirm we have received it").
//
// Set a little faster than the usual UK benchmarks — councils and housing associations promise emergencies made safe
// in 24 hours, urgent repairs in 3–5 working days and routine ones in 20–28 working days; there is no fixed legal
// timescale for private lets yet ("reasonable time"). Awaab's Law (social housing since Oct 2025, being consulted on
// for private renting under the Renters' Rights Act) adds: emergency hazards within 24 hours, and damp and mould
// that's a risk to health investigated within 10 working days — so damp and mould are never treated as routine here.
// Working days skip weekends and bank holidays in England.

export type RepairTier = 'emergency' | 'urgent' | 'routine'

export const REPAIR_TARGETS: Record<RepairTier, { workingDays: number; label: string; promise: (by: string) => string }> = {
  emergency: { workingDays: 1, label: 'Emergency', promise: () => 'We’ll make it safe within 24 hours.' },
  urgent: { workingDays: 5, label: 'Urgent', promise: by => `Please allow us up to 5 working days to fix this — by ${by}. We’ll always aim to be sooner.` },
  routine: { workingDays: 10, label: 'Routine', promise: by => `Please allow us up to 10 working days to fix this — by ${by}. We’ll always aim to be sooner.` },
}

/** How many days after a job is marked done a tenant can still reopen it. */
export const REOPEN_DAYS = 30

export const REOPEN_REASONS = {
  not_done: 'It was never done',
  broke_again: 'It’s gone wrong again',
  more_needed: 'Something else needs doing too',
} as const
export type ReopenReason = keyof typeof REOPEN_REASONS

// bank holidays in England and Wales (gov.uk)
const BANK_HOLIDAYS = new Set([
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
])

/** The tier for a job: its priority, and damp or mould never routine. */
export function tierFor(t: { priority?: string | null; category?: string | null; title?: string | null; description?: string | null }): RepairTier {
  const p = String(t.priority ?? '').toLowerCase()
  if (p === 'emergency') return 'emergency'
  if (p === 'high' || p === 'medium' || p === 'urgent') return 'urgent'
  if (/\b(damp|mou?ld|condensation)\b/i.test(`${t.category ?? ''} ${t.title ?? ''} ${t.description ?? ''}`)) return 'urgent'
  return 'routine'
}

/** `from` (YYYY-MM-DD, UK) plus n working days. */
export function addWorkingDays(from: string, n: number): string {
  const d = new Date(`${from}T12:00:00Z`)
  let left = n
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const iso = d.toISOString().slice(0, 10), dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6 && !BANK_HOLIDAYS.has(iso)) left--
  }
  return d.toISOString().slice(0, 10)
}

const ukDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The date we aim to have it fixed by, counted from when we received it, and the sentence to tell the tenant. */
export function repairTarget(t: { priority?: string | null; category?: string | null; title?: string | null; description?: string | null; created_at?: string | null }) {
  const tier = tierFor(t)
  const received = t.created_at ? new Date(t.created_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const by = addWorkingDays(received, REPAIR_TARGETS[tier].workingDays)
  return { tier, label: REPAIR_TARGETS[tier].label, by, byText: ukDay(by), message: REPAIR_TARGETS[tier].promise(ukDay(by)) }
}

/** Can this finished job still be reopened by the tenant? */
export function canReopen(t: { status?: string | null; completed_at?: string | null }): boolean {
  if (t.status !== 'completed' || !t.completed_at) return false
  return Date.now() - new Date(t.completed_at).getTime() < REOPEN_DAYS * 86_400_000
}
