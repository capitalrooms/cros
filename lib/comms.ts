/**
 * Master switch for outbound tenant / applicant messaging (push, email, SMS).
 *
 * OFF by default so real property and tenant data can be loaded and tested
 * without anyone being notified. Staff messaging (contractors, cleaners, admins)
 * is unaffected — only tenant/applicant-facing sends are paused.
 *
 * To go live: set the env var TENANT_COMMS_LIVE=true (in Vercel → Settings →
 * Environment Variables, then redeploy). Anything other than the exact string
 * "true" is treated as OFF, so the safe state is the default.
 */
export function tenantCommsLive(): boolean {
  return process.env.TENANT_COMMS_LIVE === 'true'
}

/** Roles that are internal staff — always allowed to receive notifications. */
const STAFF_ROLES = new Set(['administrator', 'admin', 'contractor', 'cleaner', 'lettings'])
export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES.has(role)
}
