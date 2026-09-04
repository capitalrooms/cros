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
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data } = await supabase
      .from('notification_templates')
      .select('subject_line, template_text')
      .eq('slug', slug)
      .eq('is_hardcoded', false)
      .eq('is_system_message', true)
      .maybeSingle()

    const result: TemplateParts | null = data
      ? { subject_line: data.subject_line ?? '', template_text: data.template_text ?? '' }
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
export function render(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
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
  vars: Record<string, string | number | null | undefined>
): Promise<{ subject: string; body: string } | null> {
  const tpl = await getTemplate(slug)
  if (!tpl) return null
  return {
    subject: render(tpl.subject_line, vars),
    body:    render(tpl.template_text, vars),
  }
}
