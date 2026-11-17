// Planner photos that open anywhere — the office planner, emails, a shared board — without being public (17 Nov 2026:
// photos were saved to a private folder but shown with a public link, so they never loaded: "Bucket not found").
// plannerImg(bucket, path) → /api/planner/img?b&p&s, a link signed by our server; the route hands out a short-lived
// file link. Server only.
import crypto from 'crypto'
import { PORTAL_URL } from '@/lib/emailWrapper'

export const IMG_BUCKETS = new Set(['planner-files', 'property-documents'])
const sig = (b: string, p: string) => crypto.createHmac('sha256', `planner-img:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`).update(`${b}/${p}`).digest('base64url').slice(0, 22)
export const plannerImg = (bucket: string, path: string) => `${PORTAL_URL.replace(/\/$/, '')}/api/planner/img?b=${encodeURIComponent(bucket)}&p=${encodeURIComponent(path)}&s=${sig(bucket, path)}`
export const checkImg = (b: string, p: string, s: string) => IMG_BUCKETS.has(b) && !p.includes('..') && s.length === 22 && crypto.timingSafeEqual(Buffer.from(sig(b, p)), Buffer.from(s))

/** A stored link the old way (a public link into a private folder) → one that works; anything else unchanged. */
export function fixImg(url: string): string {
  const m = String(url).match(/\/storage\/v1\/object\/public\/(planner-files|property-documents)\/([^?]+)/)
  return m ? plannerImg(m[1], decodeURIComponent(m[2])) : url
}
/** { bucket, path } from one of our planner image links, or null. */
export function readImg(url: string): { bucket: string; path: string } | null {
  try { const u = new URL(url, 'https://x'); if (!u.pathname.endsWith('/api/planner/img')) return null
    const b = u.searchParams.get('b') ?? '', p = u.searchParams.get('p') ?? '', s = u.searchParams.get('s') ?? ''
    return checkImg(b, p, s) ? { bucket: b, path: p } : null } catch { return null }
}
