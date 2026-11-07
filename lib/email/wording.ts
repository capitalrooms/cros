// Email wording you can change from the hub (7 Nov 2026, Harry: "come here to say make heading bolder or remove the bit
// about this … give me 5 new examples … tick which one you prefer and that saves as the new default"). Emails whose
// wording is stored (notification_templates, read by lib/messageTemplate getTemplate — the newest copy is the one used)
// can be rewritten here: the AI makes one or five versions that keep every {{placeholder}}, you pick one, and it's saved
// as a new copy — so it's the default from the next send, and earlier copies stay to go back to. Emails built in code
// take a change request instead (kept in system_settings 'email_change_requests') for the developer. Server-only.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const REQUESTS = 'email_change_requests'

export async function wordingFor(s: SupabaseClient, slugs: string[]) {
  const { data } = await s.from('notification_templates').select('id, slug, name, subject_line, template_text, updated_at').in('slug', slugs).eq('is_hardcoded', false).order('updated_at', { ascending: false })
  return slugs.map(slug => {
    const rows = ((data ?? []) as any[]).filter(r => r.slug === slug)
    // the same wording saved twice is one version
    const versions = rows.filter((r, i) => rows.findIndex(x => x.subject_line === r.subject_line && x.template_text === r.template_text) === i)
    return { slug, name: rows[0]?.name ?? slug, current: versions[0] ?? null, history: versions.slice(1, 10) }
  })
}

const placeholders = (t: string) => [...new Set(t.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [])]

export async function rewrite(current: { subject_line: string; template_text: string }, instruction: string, n: number): Promise<{ subject_line: string; template_text: string }[]> {
  const keep = placeholders(`${current.subject_line}\n${current.template_text}`)
  const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 16000, output_config: { effort: 'medium' }, messages: [{ role: 'user', content: `This is an email template used by Capital Rooms, a London letting agent. Rewrite it as the office asks.

What the office wants: ${instruction}

Rules: keep EVERY placeholder exactly as written (${keep.join(' ') || 'none'}) — they're filled in when it's sent. If the template contains HTML, keep it valid HTML with inline styles (it goes in an email); otherwise keep it plain text. British English. Don't add facts, prices, dates or promises that aren't in the original. Never "non-refundable" for a holding deposit.
${n > 1 ? `Give ${n} distinct versions — vary the approach, not just a word or two.` : 'Give one version.'}

SUBJECT: ${current.subject_line}
TEMPLATE:
${current.template_text}

Reply with ONLY JSON: [{"subject_line": "...", "template_text": "..."}]` }] } as any)
  const text = (r.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  const out = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)) as any[]
  // a version that lost a placeholder would send blanks — never offered
  return out.slice(0, n).map(v => ({ subject_line: String(v.subject_line ?? ''), template_text: String(v.template_text ?? '') }))
    .filter(v => keep.every(p => `${v.subject_line}\n${v.template_text}`.includes(p)))
}

/** Save a version as a new copy of the template — the newest is the one sent from now on. */
export async function adopt(s: SupabaseClient, slug: string, v: { subject_line: string; template_text: string }): Promise<void> {
  const { data: base } = await s.from('notification_templates').select('*').eq('slug', slug).eq('is_hardcoded', false).order('updated_at', { ascending: false }).limit(1).maybeSingle() as { data: any }
  if (!base) throw new Error('That email’s wording isn’t stored yet')
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = base
  const now = new Date().toISOString()
  const { error } = await s.from('notification_templates').insert({ ...rest, subject_line: v.subject_line.slice(0, 300), template_text: v.template_text.slice(0, 20000), is_hardcoded: false, is_system_message: true, created_at: now, updated_at: now })
  if (error) throw new Error(error.message)
}

export async function addRequest(s: SupabaseClient, kind: string, instruction: string, by: string | null) {
  const { data } = await s.from('system_settings').select('value').eq('key', REQUESTS).maybeSingle()
  let list: any[] = []
  try { list = JSON.parse(String((data as any)?.value ?? '[]')) } catch { list = [] }
  list.unshift({ kind, instruction: instruction.slice(0, 1000), by, at: new Date().toISOString(), done: false })
  await s.from('system_settings').upsert({ key: REQUESTS, value: JSON.stringify(list.slice(0, 200)), updated_at: new Date().toISOString() })
}
export async function requests(s: SupabaseClient): Promise<any[]> {
  const { data } = await s.from('system_settings').select('value').eq('key', REQUESTS).maybeSingle()
  try { return JSON.parse(String((data as any)?.value ?? '[]')) } catch { return [] }
}
