// Landlords' correspondence addresses from the statements we were sent (3 Nov 2026, Harry: "get the landlord
// correspondence addresses from their statements we have brought in and add them into their profiles"). The statement
// PDFs aren't kept in CROS; they're still held by the email service that received them at statements@, so each
// landlord's latest one is fetched, read, and the address offered — saved only when the office accepts it.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL } from '@/lib/ai-classify'

const H = () => ({ Authorization: `Bearer ${process.env.RESEND_API_KEY}` })

export interface AddressCandidate { landlordId: string; name: string; current: string | null; statement: string; emailId: string; attachmentId: string; fileName: string }

/** Each landlord's latest statement email with a PDF, matched by the agent's statement number (LS…). */
export async function addressCandidates(s: SupabaseClient): Promise<AddressCandidate[]> {
  const all: any[] = []
  let after: string | null = null
  for (let page = 0; page < 10; page++) {
    const r: Response = await fetch(`https://api.resend.com/emails/receiving?limit=100${after ? `&after=${after}` : ''}`, { headers: H() })
    if (!r.ok) break
    const d: any = await r.json()
    all.push(...(d.data ?? []))
    if (!d.has_more || !d.data?.length) break
    after = d.data[d.data.length - 1].id
  }
  const { data: st } = await s.from('landlord_statements').select('statement_reference, statement_date, landlord_id').like('statement_reference', 'LS%').not('landlord_id', 'is', null)
  const byNo = new Map(((st ?? []) as any[]).map(x => [String(x.statement_reference).match(/^LS\d+/i)?.[0]?.toUpperCase(), x]))
  const { data: people } = await s.from('people').select('id, salutation, first_name, last_name, full_name, company, home_address').eq('role', 'landlord')
  const P = new Map(((people ?? []) as any[]).map(p => [p.id, p]))
  const best = new Map<string, AddressCandidate & { date: string }>()
  for (const e of all.filter(e => String(e.to).toLowerCase().includes('statements@'))) {
    for (const a of (e.attachments ?? []) as any[]) {
      const no = String(a.filename ?? '').match(/\bLS\d{3,}\b/i)?.[0]?.toUpperCase()
      const row = no ? byNo.get(no) : null
      const p = row ? P.get(row.landlord_id) : null
      if (!p || !/pdf/i.test(String(a.content_type ?? a.filename))) continue
      const prev = best.get(p.id)
      if (prev && prev.date >= row.statement_date) continue
      best.set(p.id, { landlordId: p.id, name: p.company || [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name, current: p.home_address || null, statement: no!, emailId: e.id, attachmentId: a.id, fileName: a.filename, date: row.statement_date })
    }
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name)).map(({ date, ...c }) => c)
}

/** Read the landlord's correspondence address off one statement PDF. */
export async function readAddress(c: { emailId: string; attachmentId: string }): Promise<{ name: string | null; address: string | null }> {
  const meta = await fetch(`https://api.resend.com/emails/inbound/${c.emailId}/attachments/${c.attachmentId}`, { headers: H() }).then(x => x.ok ? x.json() : null).catch(() => null)
  if (!meta?.download_url) throw new Error('The statement file couldn’t be fetched')
  const f = await fetch(meta.download_url)
  if (!f.ok) throw new Error('The statement file couldn’t be fetched')
  const b64 = Buffer.from(await f.arrayBuffer()).toString('base64')
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const r = await ai.messages.create({ model: AI_MODEL, max_tokens: 400, messages: [{ role: 'user', content: [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } } as any,
    { type: 'text', text: 'This is a letting agent\'s statement to a landlord. Give the landlord\'s name and the postal address the statement is addressed to (the landlord\'s correspondence address — NOT the rental property, NOT the agent). JSON only: {"name": "...", "address_lines": ["...", "..."], "postcode": "..."} — use null where not shown.' },
  ] }] })
  const text = (r.content.find(b => b.type === 'text') as any)?.text ?? '{}'
  const j = JSON.parse(text.replace(/```json\n?|```/g, '').trim() || '{}')
  const lines = [...(Array.isArray(j.address_lines) ? j.address_lines : []), j.postcode].map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
  return { name: j.name ?? null, address: lines.length ? [...new Set(lines)].join('\n') : null }
}
