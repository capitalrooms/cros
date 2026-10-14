// The phone "Share to CROS" key (14 Oct 2026). The share sheet posts files to /api/share-target without our usual
// sign-in token, so each signed-in staff device carries this signed, httpOnly cookie instead; share-target refuses any
// upload without a valid one. Format: <personId>.<expiry ms>.<HMAC-SHA256>. Server only.
import crypto from 'node:crypto'

export const SHARE_COOKIE = 'cros_share'
const DAYS = 30
const secret = () => crypto.createHash('sha256').update(`cros-share-key:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`).digest()
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url')

export function makeShareKey(personId: string): { value: string; maxAge: number } {
  const exp = Date.now() + DAYS * 86400_000
  const payload = `${personId}.${exp}`
  return { value: `${payload}.${sign(payload)}`, maxAge: DAYS * 86400 }
}

/** The person the key was made for, or null when it is missing, altered or expired. */
export function readShareKey(value: string | undefined | null): string | null {
  if (!value) return null
  const [personId, exp, mac] = value.split('.')
  if (!personId || !exp || !mac || Number(exp) < Date.now()) return null
  const good = Buffer.from(sign(`${personId}.${exp}`))
  const given = Buffer.from(mac)
  return good.length === given.length && crypto.timingSafeEqual(good, given) ? personId : null
}
