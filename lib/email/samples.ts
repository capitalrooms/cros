// The latest real copy of each kind of email, for the Email hub's previews (6 Nov 2026, migration 267). buildEmail
// keeps one as an email is made — at most every 6 hours per kind — after taking out anything private: every link
// becomes "#", and anything that looks like a code or token is blanked. Sign-in, set-up and password emails are never
// kept (their whole point is a private link). Server-only; never blocks or breaks sending.
import { createServiceClient } from '@/lib/supabase'

const NEVER = new Set(['sign-in-link', 'password-reset', 'account-setup'])
const lastKept = new Map<string, number>()

export function scrub(html: string): string {
  return html
    .replace(/\bhref\s*=\s*"[^"]*"/gi, 'href="#"').replace(/\bhref\s*=\s*'[^']*'/gi, "href='#'")
    .replace(/https?:\/\/[^\s"'<>)]+/gi, m => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(m) && !/token|sig=|signature|[?&](t|s|k)=/i.test(m) ? m : '#')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '•••')
}

export function keepSample(kind: string | undefined, body: string, hero?: string): void {
  if (!kind || NEVER.has(kind)) return
  const now = Date.now()
  if ((lastKept.get(kind) ?? 0) > now - 6 * 3600_000) return
  lastKept.set(kind, now)
  createServiceClient().from('email_samples').upsert({ kind, body: scrub(body), hero: hero ? scrub(hero) : null, updated_at: new Date().toISOString() })
    .then(({ error }) => { if (error && !/email_samples/.test(error.message)) console.warn('email sample not kept:', error.message) }, () => {})
}

export async function samplesFor(kinds?: string[]): Promise<Record<string, { body: string; hero: string | null; updated_at: string }>> {
  let q = createServiceClient().from('email_samples').select('kind, body, hero, updated_at')
  if (kinds?.length) q = q.in('kind', kinds)
  const { data } = await q
  return Object.fromEntries(((data ?? []) as any[]).map(r => [r.kind, r]))
}
