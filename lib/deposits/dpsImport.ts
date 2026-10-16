// Bring in what the DPS already holds (16 Oct 2026). The office downloads its deposit list from the DPS (CSV), or
// copies it off the screen, and CROS matches each deposit to a tenancy — tenant surname, postcode and amount — for
// someone to confirm. Confirmed lines stamp tenancies.deposit_scheme / deposit_scheme_ref / deposit_protected_at.
// A CSV with recognisable headings is read directly; anything else is read by the AI into the same rows.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DpsLine { ref: string; tenant: string; address: string; postcode: string; amount: number | null; protectedOn: string | null }
export interface DpsMatch { line: DpsLine; tenancyId: string | null; tenancyLabel: string | null; score: number; why: string[]; already: boolean }

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i
const pc = (s: string) => { const m = String(s ?? '').toUpperCase().match(POSTCODE); return m ? `${m[1]} ${m[2]}` : '' }
const money = (s: unknown) => { const n = Number(String(s ?? '').replace(/[£,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null }

/** dd/mm/yyyy, d-m-yy, yyyy-mm-dd, "3 June 2026" → yyyy-mm-dd */
export function isoDate(s: unknown): string | null {
  const t = String(s ?? '').trim()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  const d = new Date(t)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') q = false; else cell += ch; continue }
    if (ch === '"') q = true
    else if (ch === ',' || ch === '\t') { row.push(cell.trim()); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row)
  return rows
}

/** Read a DPS export by its headings. Returns null if the headings aren't recognisable (then the AI reads it). */
export function readDpsCsv(text: string): DpsLine[] | null {
  const rows = parseCsv(text)
  if (rows.length < 2) return null
  const hi = rows.findIndex(r => r.some(c => /\b(dan|deposit (id|number|ref)|reference|protection (id|number))\b/i.test(c)) && r.some(c => /amount|value|deposit/i.test(c)))
  if (hi < 0) return null
  const h = rows[hi].map(c => c.toLowerCase())
  const col = (...res: RegExp[]) => { for (const re of res) { const i = h.findIndex(c => re.test(c)); if (i >= 0) return i } return -1 }
  const iRef = col(/^dan$|\bdan\b/, /deposit (id|number|ref)/, /protection (id|number)/, /reference/)
  const iTen = col(/lead tenant/, /tenant/, /^name$|full name/)
  const iAddr = col(/property address|address line 1|^address/, /property/)
  const iPc = col(/post ?code/)
  const iAmt = col(/deposit amount|amount protected|amount/, /value/)
  const iDate = col(/protect/, /date (received|paid)|received/, /\bdate\b/)
  if (iRef < 0 || iAmt < 0) return null
  return rows.slice(hi + 1).map(r => {
    const address = iAddr >= 0 ? r[iAddr] ?? '' : ''
    return {
      ref: String(r[iRef] ?? '').trim(), tenant: iTen >= 0 ? String(r[iTen] ?? '').trim() : '',
      address, postcode: pc(iPc >= 0 ? r[iPc] : address) || pc(r.join(' ')),
      amount: money(r[iAmt]), protectedOn: iDate >= 0 ? isoDate(r[iDate]) : null,
    }
  }).filter(l => l.ref && l.amount)
}

/** Anything else — a different export, or text copied off the DPS website — read by the AI into the same rows. */
export async function readDpsWithAi(text: string): Promise<DpsLine[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('The AI reader isn’t set up (ANTHROPIC_API_KEY).')
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 4096,
    system: `The text is a list of tenancy deposits protected with the Deposit Protection Service (a CSV export or text copied from its website).
Return ONLY a JSON array, one object per deposit: {"ref": the deposit / DAN reference exactly as written, "tenant": lead tenant name, "address": property address, "postcode": property postcode or "", "amount": deposit amount as a number, "protectedOn": date protected as YYYY-MM-DD or null}. Skip totals, headings and anything that isn't a deposit.`,
    messages: [{ role: 'user', content: text.slice(0, 60_000) }],
  })
  const out = msg.content.map((b: any) => b.type === 'text' ? b.text : '').join('')
  const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1)
  const arr = JSON.parse(json || '[]') as any[]
  return arr.map(x => ({ ref: String(x.ref ?? '').trim(), tenant: String(x.tenant ?? '').trim(), address: String(x.address ?? ''), postcode: pc(x.postcode || x.address), amount: money(x.amount), protectedOn: isoDate(x.protectedOn) })).filter(l => l.ref && l.amount)
}

const words = (s: string) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter(w => w.length > 1 && !['mr', 'mrs', 'ms', 'miss', 'dr', 'mx'].includes(w))

/** Match each DPS line to the most likely tenancy (current or recent) with a deposit. */
export async function matchDps(s: SupabaseClient, lines: DpsLine[]): Promise<DpsMatch[]> {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)
  const { data: ten } = await s.from('tenancies')
    .select('id, deposit_amount, deposit_scheme_ref, start_date, end_date, property_id, rooms(name), properties(name, address, postcode, is_demo), people!person_id(first_name, last_name, full_name), co:people!co_tenant_id(first_name, last_name, full_name)')
    .gt('deposit_amount', 0).is('let_cancelled_at', null).or(`end_date.is.null,end_date.gte.${since}`) as { data: any[] | null }
  const pool = (ten ?? []).filter(t => !t.properties?.is_demo)
  const used = new Set<string>()
  return lines.map(line => {
    const lw = words(line.tenant), lpc = line.postcode.replace(/\s/g, ''), laddr = words(line.address)
    let best: { t: any; score: number; why: string[] } | null = null
    for (const t of pool) {
      const why: string[] = []; let score = 0
      const names = [t.people, t.co].filter(Boolean).flatMap((p: any) => [words(p.last_name || ''), words(p.first_name || '')])
      const surnames = [t.people, t.co].filter(Boolean).map((p: any) => words(p.last_name || p.full_name || '').pop()).filter(Boolean) as string[]
      if (surnames.some(sn => lw.includes(sn))) { score += 45; why.push('surname') }
      else if (names.flat().some(n => lw.includes(n))) { score += 15; why.push('first name') }
      const tpc = String(t.properties?.postcode || pc(t.properties?.address) || '').replace(/\s/g, '').toUpperCase()
      if (lpc && tpc && lpc.toUpperCase() === tpc) { score += 30; why.push('postcode') }
      else if (laddr.length && words(`${t.properties?.name} ${t.properties?.address}`).filter(w => laddr.includes(w) && w.length > 3).length >= 2) { score += 20; why.push('street') }
      if (line.amount != null && Math.abs(Number(t.deposit_amount) - line.amount) < 0.011) { score += 25; why.push('amount') }
      if (t.deposit_scheme_ref && String(t.deposit_scheme_ref).trim().toUpperCase() === line.ref.toUpperCase()) { score += 100; why.unshift('already recorded') }
      if (!best || score > best.score) best = { t, score, why }
    }
    const ok = best && best.score >= 70 && !used.has(best.t.id)
    if (ok) used.add(best!.t.id)
    const p = best?.t
    return {
      line, tenancyId: ok ? p.id : null, score: best?.score ?? 0, why: best?.why ?? [],
      tenancyLabel: p ? `${[p.people?.first_name, p.people?.last_name].filter(Boolean).join(' ')}${p.co ? ` & ${p.co.first_name ?? ''} ${p.co.last_name ?? ''}` : ''} — ${p.rooms?.name ? `${p.rooms.name}, ` : ''}${String(p.properties?.name ?? '').split('\n')[0]} (£${Number(p.deposit_amount).toFixed(2)})` : null,
      already: !!(ok && p.deposit_scheme_ref && String(p.deposit_scheme_ref).trim().toUpperCase() === line.ref.toUpperCase()),
    }
  })
}
