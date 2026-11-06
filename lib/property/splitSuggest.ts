// The AI suggests how a job naming several parts of the house was divided (6 Nov 2026, Harry: "it could either just
// split the cost … or ask admin to review it"). It reads the line and — for an expense with its invoice on file — the
// invoice itself, using the invoice's own itemised amounts when there are any, else an estimate from typical costs.
// The office accepts or changes it; nothing is saved without them (app/api/admin/upkeep). Server-only.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readStoredFile } from '@/lib/files/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface SplitSuggestion { splits: { area: string; amount: number }[]; why: string; fromInvoice: boolean }

export async function suggestSplit(s: SupabaseClient, source: 'expense' | 'statement', lineId: string, areas: { key: string; label: string }[]): Promise<SplitSuggestion> {
  const { data: line } = source === 'expense'
    ? await s.from('recharge_expenses').select('description, notes, amount, supplier, invoice_path').eq('id', lineId).maybeSingle() as { data: any }
    : await s.from('statement_line_items').select('description, amount').eq('id', lineId).maybeSingle() as { data: any }
  if (!line) throw new Error('Line not found')
  const total = Math.abs(Number(line.amount))
  const content: Anthropic.ContentBlockParam[] = []
  let fromInvoice = false
  if (line.invoice_path) {
    try {
      const f = await readStoredFile(line.invoice_path)
      if (/pdf/i.test(f.contentType) || /\.pdf$/i.test(line.invoice_path)) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.bytes.toString('base64') } } as any)
      else if (/image/i.test(f.contentType)) content.push({ type: 'image', source: { type: 'base64', media_type: (/png/.test(f.contentType) ? 'image/png' : 'image/jpeg') as any, data: f.bytes.toString('base64') } })
      fromInvoice = content.length > 0
    } catch { /* no invoice to read — the description alone */ }
  }
  content.push({ type: 'text', text: `A UK rented house had one bill of £${total.toFixed(2)} covering work in several parts of the house.
Bill: "${line.description}"${line.supplier ? ` from ${line.supplier}` : ''}${line.notes ? `. Notes: ${line.notes}` : ''}${fromInvoice ? '\nThe invoice is attached — if it itemises amounts, use them exactly.' : ''}
Split it between these parts (use these keys): ${areas.map(a => `${a.key} = ${a.label}`).join(', ')}.
If the invoice itemises it, follow it. Otherwise estimate from typical London trade prices for each piece of work (e.g. repainting a bedroom vs fixing a tap).
Reply with ONLY JSON: {"splits":[{"area":"<key>","amount":<number>}],"why":"one short sentence","itemised":true|false}. The amounts must add up to exactly ${total.toFixed(2)}.` })
  const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 2000, output_config: { effort: 'low' }, messages: [{ role: 'user', content }] } as any)
  const text = (r.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  const keys = new Set(areas.map(a => a.key))
  let splits = (Array.isArray(j.splits) ? j.splits : []).filter((x: any) => keys.has(x.area)).map((x: any) => ({ area: x.area, amount: Math.max(0, Math.round(Number(x.amount) * 100) / 100) }))
  if (!splits.length) splits = areas.map(a => ({ area: a.key, amount: Math.round(total / areas.length * 100) / 100 }))
  // make it add up to the penny — any difference goes on the largest part
  const diff = Math.round((total - splits.reduce((n: number, x: any) => n + x.amount, 0)) * 100) / 100
  if (diff) { const big = splits.reduce((m: any, x: any) => x.amount > m.amount ? x : m, splits[0]); big.amount = Math.round((big.amount + diff) * 100) / 100 }
  return { splits, why: String(j.why ?? '').slice(0, 200), fromInvoice: fromInvoice && !!j.itemised }
}
