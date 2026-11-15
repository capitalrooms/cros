// A booking link for a contractor who isn't on the app (25 Oct 2026, Harry: "let fleeting contractors use just a
// booking system… sent a link via email… they choose their slot and it notifies the tenants… if they re-enter the
// link they can move the appointment"). The link names the job and the contractor and carries a signature only the
// server can make, so there's no account and nothing to store. It stops working if the job is given to someone
// else, finished or cancelled. Server-only.
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PORTAL_URL } from '@/lib/emailWrapper'
import { nameFields, displayName, noEmailPlaceholder } from '@/lib/people'

const secret = () => `job-booking-link:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`
const sign = (ticketId: string, personId: string) => crypto.createHmac('sha256', secret()).update(`${ticketId}.${personId}`).digest('base64url').slice(0, 32)
const UUID = /^[0-9a-f-]{36}$/i

export const bookingToken = (ticketId: string, personId: string) => `${ticketId}.${personId}.${sign(ticketId, personId)}`

// A short form for texts (15 Nov 2026 — the long link filled half the message): the two ids as raw bytes plus 16
// characters of the same signature → capitalrooms.co.uk/j/<60 characters>. /j/[code] checks it and opens /book/<token>.
const uuidToB64 = (u: string) => Buffer.from(u.replace(/-/g, ''), 'hex').toString('base64url')
const b64ToUuid = (b: string) => { const h = Buffer.from(b, 'base64url').toString('hex'); return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : '' }
export const shortCode = (ticketId: string, personId: string) => `${uuidToB64(ticketId)}${uuidToB64(personId)}${sign(ticketId, personId).slice(0, 16)}`
/** The full token for a short code, or null if it isn't one CROS made. */
export function fromShortCode(code: string): string | null {
  const c = String(code ?? '')
  if (c.length !== 60) return null
  const ticketId = b64ToUuid(c.slice(0, 22)), personId = b64ToUuid(c.slice(22, 44))
  if (!UUID.test(ticketId) || !UUID.test(personId)) return null
  const want = Buffer.from(sign(ticketId, personId).slice(0, 16)), got = Buffer.from(c.slice(44))
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? bookingToken(ticketId, personId) : null
}
export const bookingLink = (ticketId: string, personId: string) => `${PORTAL_URL.replace(/\/$/, '')}/j/${shortCode(ticketId, personId)}`

/** The job and contractor a link is for, or null if it's not one CROS made. */
export function readBookingToken(token: string): { ticketId: string; personId: string } | null {
  const [ticketId, personId, s] = String(token ?? '').split('.')
  if (!UUID.test(ticketId ?? '') || !UUID.test(personId ?? '') || !s) return null
  const want = Buffer.from(sign(ticketId, personId)), got = Buffer.from(s)
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? { ticketId, personId } : null
}

/** The contractor's people row (no sign-in): an existing contractor with that email or mobile, else a new one. */
export async function offAppContractor(s: SupabaseClient, c: { name: string; phone: string; email: string }): Promise<{ id: string } | { error: string }> {
  const email = c.email.trim().toLowerCase(), digits = c.phone.replace(/[^\d]/g, '').replace(/^44/, '0')
  if (email) {
    const { data: byEmail } = await s.from('people').select('id, role').ilike('email', email).limit(1).maybeSingle()
    if (byEmail) return byEmail.role === 'contractor' ? { id: byEmail.id } : { error: 'That email belongs to someone in CROS who isn’t a contractor.' }
  }
  if (digits.length >= 10) {
    const { data: all } = await s.from('people').select('id, phone').eq('role', 'contractor').not('phone', 'is', null)
    const hit = (all ?? []).find((p: any) => String(p.phone).replace(/[^\d]/g, '').replace(/^44/, '0') === digits)
    if (hit) return { id: (hit as any).id }
  }
  const [first, ...rest] = c.name.trim().split(/\s+/)
  const { data, error } = await s.from('people').insert({
    ...nameFields(first || c.name.trim(), rest.join(' ')),
    email: email || noEmailPlaceholder(c.phone), phone: c.phone.trim() || null, role: 'contractor',   // email can't be empty
    notify_by_sms: true, notify_by_email: !!email, notify_by_push: false,
  }).select('id').single()
  return error || !data ? { error: `Couldn’t add ${c.name}: ${error?.message ?? 'unknown error'}` } : { id: data.id }
}

export const contractorLabel = (p: any) => (p?.company ? `${displayName(p)} (${p.company})` : displayName(p)) || 'The contractor'
