// A planner link that works without signing in (17 Nov 2026, Harry: "send a planner to someone without them having to
// log in … a contractor we don't use much … they can just come back to the link and pick up in the planner"). The link
// names the board and carries a signature only the server can make; it opens THAT board only, as its member — read,
// add notes, links and photos, reply, tick off — and nothing else in CROS. It stops working if the board is archived.
// Server-only.
import crypto from 'crypto'
import { PORTAL_URL } from '@/lib/emailWrapper'

const secret = () => `planner-link:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`
const UUID = /^[0-9a-f-]{36}$/i
const sign = (boardId: string) => crypto.createHmac('sha256', secret()).update(boardId).digest('base64url').slice(0, 24)
const b64 = (u: string) => Buffer.from(u.replace(/-/g, ''), 'hex').toString('base64url')
const unb64 = (s: string) => { const h = Buffer.from(s, 'base64url').toString('hex'); return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : '' }

// a board's own link (its first person: 46 characters), or one person's link on a shared board (68: board + person)
export const plannerToken = (boardId: string, personId?: string | null) => personId ? `${b64(boardId)}${b64(personId)}${sign(`${boardId}:${personId}`)}` : `${b64(boardId)}${sign(boardId)}`
export const plannerLink = (boardId: string, personId?: string | null) => `${PORTAL_URL.replace(/\/$/, '')}/p/${plannerToken(boardId, personId)}`
/** { boardId, personId? } a token opens, or null if CROS didn't make it. */
export function readPlannerLink(token: string | null | undefined): { boardId: string; personId: string | null } | null {
  const t = String(token ?? '')
  if (t.length === 46) { const b = readPlannerToken(t); return b ? { boardId: b, personId: null } : null }
  if (t.length !== 68) return null
  const boardId = unb64(t.slice(0, 22)), personId = unb64(t.slice(22, 44))
  if (!UUID.test(boardId) || !UUID.test(personId)) return null
  const want = Buffer.from(sign(`${boardId}:${personId}`)), got = Buffer.from(t.slice(44))
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? { boardId, personId } : null
}
/** The board a token opens, or null if CROS didn't make it. */
export function readPlannerToken(token: string | null | undefined): string | null {
  const t = String(token ?? '')
  if (t.length !== 46) return null
  const boardId = unb64(t.slice(0, 22))
  if (!UUID.test(boardId)) return null
  const want = Buffer.from(sign(boardId)), got = Buffer.from(t.slice(22))
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? boardId : null
}
