// The tenant's own link to their online move-out form (/moveout/<token>, 4 Nov 2026). Signed, so it can't be guessed
// or edited to reach someone else's tenancy, and it lasts long enough to cover a two-month notice and the check-out.
// Format: <tenancyId>.<expiry ms>.<HMAC>. Server only.
import crypto from 'node:crypto'

const DAYS = 120
const secret = () => crypto.createHash('sha256').update(`cros-move-out:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`).digest()
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, 32)
const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://capitalrooms.co.uk'

export function moveOutToken(tenancyId: string): string {
  const payload = `${tenancyId}.${Date.now() + DAYS * 86400_000}`
  return `${payload}.${sign(payload)}`
}
export const moveOutUrl = (tenancyId: string) => `${SITE}/moveout/${moveOutToken(tenancyId)}`

/** The tenancy the link was made for, or null when it is altered or out of date. */
export function readMoveOutToken(token: string | null | undefined): string | null {
  const [id, exp, mac] = String(token ?? '').split('.')
  if (!id || !exp || !mac || !/^[0-9a-f-]{36}$/i.test(id) || Number(exp) < Date.now()) return null
  const good = Buffer.from(sign(`${id}.${exp}`)), given = Buffer.from(mac)
  return good.length === given.length && crypto.timingSafeEqual(good, given) ? id : null
}

/** The cleaner tenants can book for their last day — taken from the deposit (Harry, 4 Nov 2026). */
export const MOVE_OUT_CLEAN_RATE = 20
