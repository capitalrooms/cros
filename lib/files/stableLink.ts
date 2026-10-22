// A link to a house document that never expires (22 Oct 2026): certificate emails used 1-year signed storage links,
// so a tenant opening last year's email got an error. This link names the document and carries a signature only the
// server can make; each click checks it and hands over a fresh 5-minute private link (app/api/doc/[id]). Deleting the
// document ends the link. Server-only.
import crypto from 'crypto'
import { PORTAL_URL } from '@/lib/emailWrapper'

const secret = () => `stable-doc-link:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`
export const docSignature = (id: string) => crypto.createHmac('sha256', secret()).update(id).digest('base64url').slice(0, 32)
export const stableDocLink = (id: string) => `${PORTAL_URL}/api/doc/${id}?s=${docSignature(id)}`
export function validDocSignature(id: string, s: string | null): boolean {
  if (!s) return false
  const want = Buffer.from(docSignature(id)), got = Buffer.from(s)
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}
