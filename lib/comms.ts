/**
 * Master switch for outbound tenant / applicant messaging (push, email, SMS).
 *
 * OFF by default so real property and tenant data can be loaded and tested
 * without anyone being notified. Staff messaging (contractors, cleaners, admins)
 * is unaffected — only tenant/applicant-facing sends are paused.
 *
 * TWO layers of control:
 *   1. DB setting (system_settings.comms_live) — toggled from admin settings UI.
 *      Takes precedence when the row exists.
 *   2. Env var TENANT_COMMS_LIVE=true — fallback / permanent override.
 *      Requires a redeploy to change; useful for locking in the live state.
 *
 * Safe default: if neither is explicitly "true", the switch is OFF.
 */

import { createServiceClient } from './supabase'

/**
 * Sync check — env var only. Used in places where an async call isn't possible.
 * Prefer getCommsLive() in API routes.
 */
export function tenantCommsLive(): boolean {
  return process.env.TENANT_COMMS_LIVE === 'true'
}

/**
 * Async check — reads from DB first (admin-toggleable), falls back to env var.
 * Use this in all notification API routes.
 */
export async function getCommsLive(): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'comms_live')
      .maybeSingle()
    if (data?.value !== undefined) return data.value === 'true'
  } catch (_) {
    // DB unavailable — fall through to env var
  }
  return process.env.TENANT_COMMS_LIVE === 'true'
}

/**
 * Onboarding and pre-tenancy messages to NEW tenants and applicants — the move-in pack, the viewing confirmation
 * and updates to the person coming to a viewing. These are always allowed (Harry, 5 Oct 2026): the master switch
 * above exists to stop people who already live in our houses being messaged, and these people don't yet.
 * Anything that reaches current tenants (housemates, notices, certificates, house documents, Quick Notify…)
 * must keep using getCommsLive().
 */
export async function getNewTenantCommsLive(): Promise<boolean> {
  return true
}

/**
 * Messages a member of staff CHOOSES to send to current tenants — picked and sent from a button after seeing who
 * gets them: certificates to a house, the HMO licence notice, Quick Notify, and the viewing notices ticked when
 * booking a viewing. These go out while automatic messages are paused (Harry, 8 Oct 2026: "auto emails paused but
 * elected emails can still go out"). They have their own switch on the Settings page (system_settings
 * elected_comms_live; on unless set to 'false'). Anything sent automatically — on a booking, a job update, a cron,
 * a reschedule — must keep using getCommsLive().
 */
export async function getElectedCommsLive(): Promise<boolean> {
  try {
    const { data } = await createServiceClient().from('system_settings').select('value').eq('key', 'elected_comms_live').maybeSingle()
    return data?.value !== 'false'
  } catch (_) {
    return true
  }
}

/** Roles that are internal staff — always allowed to receive notifications. */
const STAFF_ROLES = new Set(['administrator', 'admin', 'contractor', 'cleaner', 'lettings'])
export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES.has(role)
}
