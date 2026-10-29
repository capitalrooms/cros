/**
 * lib/messageTemplate.ts
 *
 * Helpers for loading message templates from notification_templates DB
 * and rendering {{variable}} placeholders.
 *
 * Routes call getTemplate(slug) to check for a DB-editable version.
 * If found (is_hardcoded = false), they use it. If not, they fall back
 * to their own hardcoded defaults. Every route stays self-contained and
 * sending always works even if the DB is unreachable.
 */

import { createClient } from '@supabase/supabase-js'
import { dearName, hiName, type PersonLike } from '@/lib/people'
import { guardEmailImages } from '@/lib/email/imageGuard'

export interface TemplateParts {
  subject_line: string
  template_text: string
}

// Module-level cache — reset per serverless invocation in practice,
// but avoids multiple DB round-trips within a single request.
const _cache = new Map<string, TemplateParts | null>()

/**
 * Load an editable template from the DB by its `slug` field.
 * Returns null if:
 *  - The template doesn't exist
 *  - is_hardcoded is still true (not yet migrated to DB)
 *  - DB is unreachable
 *
 * Routes MUST have a hardcoded fallback for every call.
 */
export async function getTemplate(slug: string): Promise<TemplateParts | null> {
  if (_cache.has(slug)) return _cache.get(slug)!

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data } = await supabase
      .from('notification_templates')
      .select('subject_line, template_text')
      .eq('slug', slug)
      .eq('is_hardcoded', false)
      .eq('is_system_message', true)
      // some templates were saved twice (Sept 2026); asking for "the one" then failed and the built-in wording was
      // always used, so edits never showed (audit 15 Oct 2026). The most recently edited copy is the one.
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // A holding deposit can't be described as non-refundable (Tenant Fees Act 2019: it's returned unless the
    // applicant pulls out, fails Right to Rent, gives false information or doesn't sign by the deadline). A saved
    // template that says so is skipped and the built-in wording used, until it's reworded on the Templates screen.
    const misleading = !!data && /non[-\s]?refundable/i.test(`${data.subject_line ?? ''} ${data.template_text ?? ''}`)
    if (misleading) console.warn(`[messageTemplate] "${slug}" calls the holding deposit non-refundable — using the built-in wording`)

    const result: TemplateParts | null = data && !misleading
      // no broken pictures — a logo on an address that isn't ours becomes our own (lib/email/imageGuard, 30 Oct 2026)
      ? { subject_line: data.subject_line ?? '', template_text: guardEmailImages(data.template_text ?? '', [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://x.invalid').host]).html }
      : null

    _cache.set(slug, result)
    return result
  } catch {
    return null // Graceful degradation: fall back to hardcoded
  }
}

/**
 * Replace {{varName}} tokens with their values.
 * Missing vars resolve to '' (never left as raw {{var}}).
 * Values are NOT HTML-escaped — pass pre-escaped content or plain text.
 */
export function render(template: string, vars: Record<string, string | number | null | undefined>, who?: PersonLike | null): string {
  // The greeting always follows the one rule (lib/people, 15 Oct 2026), whatever token a saved template uses:
  // "Dear {{first_name}}" → "Dear Mr Noives", "Hi {{tenant_name}}" → "Hi Martin". Pass `who` — the recipient.
  let t = template
  if (who) {
    t = t.replace(/\b(Dear)\s*\{\{\s*\w+\s*\}\}/g, () => `Dear ${dearName(who)}`)
         .replace(/\b(Hi|Hello)\s*\{\{\s*\w+\s*\}\}/g, (_m, w) => `${w} ${hiName(who)}`)
  }
  return t.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key]
    return val != null ? String(val) : ''
  })
}

/**
 * One-shot helper: load + render in a single call.
 * Returns null if no editable template exists in the DB.
 */
export async function getAndRender(
  slug: string,
  vars: Record<string, string | number | null | undefined>,
  who?: PersonLike | null,
): Promise<{ subject: string; body: string } | null> {
  const tpl = await getTemplate(slug)
  if (!tpl) return null
  return {
    subject: render(tpl.subject_line, vars, who),
    body:    render(tpl.template_text, vars, who),
  }
}
