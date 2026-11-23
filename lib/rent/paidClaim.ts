// "I've paid" link for a short month (Harry, 22 Nov 2026): the tenant taps it from option A, so the finance team is told
// straight away and doesn't have to check the bank first. It only tells staff. It never marks anything paid: staff still
// match the payment in the bank. Signed like the move-out link (lib/checkout/moveOutLink), so it can't be guessed.
// Format: <chargeId>.<expiry ms>.<HMAC>. Server only.
import crypto from 'node:crypto'

const DAYS = 30
const secret = () => crypto.createHash('sha256').update(`cros-rent-paid:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`).digest()
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, 32)
const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://capitalrooms.co.uk'

export function paidClaimToken(chargeId: string): string {
  const payload = `${chargeId}.${Date.now() + DAYS * 86400_000}`
  return `${payload}.${sign(payload)}`
}
export const paidClaimUrl = (chargeId: string) => `${SITE}/rent-paid/${paidClaimToken(chargeId)}`

/** The rent charge the link was made for, or null when it is altered or out of date. */
export function readPaidClaimToken(token: string | null | undefined): string | null {
  const [id, exp, mac] = String(token ?? '').split('.')
  if (!id || !exp || !mac || !/^[0-9a-f-]{36}$/i.test(id) || Number(exp) < Date.now()) return null
  const good = Buffer.from(sign(`${id}.${exp}`)), given = Buffer.from(mac)
  return good.length === given.length && crypto.timingSafeEqual(good, given) ? id : null
}
