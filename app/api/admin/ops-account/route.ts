/**
 * /api/admin/ops-account — the Operations account (migration 212): money paid out of the business account, from
 * the month's bank CSV, filed line by line. CROS remembers where each payee / reference went last time.
 *   GET                                  → { lines, properties, rooms, categories, setupNeeded? }
 *   POST { action: 'import', csv, fileName }  → { added, already, total, period, warnings }
 *   POST { action: 'file', id, as: 'landlord'|'split'|'company'|'not_expense', … , remember? } → files one line:
 *        landlord: { propertyId, roomId?, description, charge?, deductMonth?, confirmDuplicate? }
 *                  charge = what the landlord pays (defaults to the bank amount; more than cost = mark-up)
 *        split:    { splits: [{ propertyId, roomId?, amount, charge?, description? }], description, confirmDuplicate? }
 *                  the shares of the bank amount must add up to it exactly
 *        company:  { category, description }
 *        not_expense: { note? }
 *   POST { action: 'undo', id }          → a "not an expense" line back to the list (filed expenses are voided in Expenses)
 *   POST { action: 'receipt_url', id, fileName } → { path, token } upload the receipt straight from the browser
 *   POST { action: 'receipt_done', id, path, fileName } → attached to the line and every expense made from it
 *   POST { action: 'no_receipt', id, value }  → "no receipt needed" (bank charges…) on or off
 * Administrators only. Every expense goes through lib/expenses/create (duplicates, statement month, numbering).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { parseBankDebits } from '@/lib/parseBank'
import { matchKey, payeeKey } from '@/lib/ops/keys'
import { addLandlordExpense, expenseDuplicates } from '@/lib/expenses/create'
import { COMPANY_CATEGORIES } from '@/lib/capture/ai'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type S = ReturnType<typeof createServiceClient>
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /ops_bank_lines|ops_payee_rules|does not exist|schema cache/i.test(e.message ?? ''))
const SETUP = 'Run migration 212 in Supabase first (it was copied for you) — then refresh.'
const titleCase = (v: string) => v.replace(/\b[a-z]/g, c => c.toUpperCase())
const OK_FILE = /\.(pdf|jpe?g|png|heic|webp|docx?|xlsx?)$/i

/** What CROS would suggest for a line: an exact match on payee + reference, else the payee's usual house. */
function suggest(line: any, byKey: Map<string, any>, byPayee: Map<string, any[]>) {
  const exact = byKey.get(line.match_key)
  if (exact) return { confidence: 'learnt' as const, ...ruleOut(exact) }
  const same = byPayee.get(line.payee_key) ?? []
  const targets = new Set(same.map(r => `${r.filed_as}:${r.property_id ?? ''}:${r.category ?? ''}`))
  if (same.length && targets.size === 1) return { confidence: 'usually' as const, ...ruleOut(same[0]) }
  if (same.length) return { confidence: 'several' as const, options: same.slice(0, 4).map(ruleOut) }
  return null
}
const ruleOut = (r: any) => ({ as: r.filed_as, propertyId: r.property_id, roomId: r.room_id, splits: r.splits, category: r.category, description: r.description, lastAmount: r.last_amount, times: r.times_used })

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const s = createServiceClient()
  const [{ data: props }, { data: rooms }] = await Promise.all([
    s.from('properties').select('id, name, address, property_code, letting_type').order('name'),
    s.from('rooms').select('id, name, property_id').order('name'),
  ])
  let demo = new Set<string>()
  { const { data, error } = await s.from('properties').select('id').eq('is_demo', true); if (!error) demo = new Set((data ?? []).map((d: any) => d.id)) }
  const properties = sortPropertiesNumerically(((props ?? []) as any[]).filter(p => !demo.has(p.id)))
    .map((p: any) => ({ id: p.id, name: String(p.name ?? '').split('\n')[0], code: p.property_code, letOnly: p.letting_type === 'let_only' }))
  const base = { properties, rooms: rooms ?? [], categories: COMPANY_CATEGORIES }

  const [{ data: lines, error }, { data: rules }] = await Promise.all([
    s.from('ops_bank_lines').select('*').eq('is_practice', false).order('line_date', { ascending: false }).limit(1500),
    s.from('ops_payee_rules').select('*'),
  ])
  if (error) return NextResponse.json(missing(error) ? { ...base, setupNeeded: SETUP, lines: [] } : { error: error.message }, { status: missing(error) ? 200 : 500 })
  const byKey = new Map<string, any>(), byPayee = new Map<string, any[]>()
  for (const r of (rules ?? []) as any[]) { byKey.set(r.match_key, r); byPayee.set(r.payee_key, [...(byPayee.get(r.payee_key) ?? []), r]) }
  return NextResponse.json({
    ...base,
    lines: ((lines ?? []) as any[]).map(l => ({ ...l, suggestion: l.status === 'new' ? suggest(l, byKey, byPayee) : null })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const s = createServiceClient()
  const b = await req.json().catch(() => ({}))

  // ── import the month's CSV ──
  if (b.action === 'import') {
    const parsed = parseBankDebits(String(b.csv ?? ''))
    if (!parsed.lines.length) return NextResponse.json({ error: parsed.warnings[0] || 'No payments out were found in that file' }, { status: 400 })
    const rows = parsed.lines.map(l => ({
      line_date: l.line_date, amount: l.amount, description: l.description.slice(0, 500), match_key: matchKey(l.description), payee_key: payeeKey(l.description),
      dedup_hash: l.dedup_hash, file_name: String(b.fileName ?? '').slice(0, 200) || null, imported_by: admin.personId,
    }))
    const { data, error } = await s.from('ops_bank_lines').upsert(rows, { onConflict: 'dedup_hash', ignoreDuplicates: true }).select('id')
    if (error) return NextResponse.json({ error: missing(error) ? SETUP : error.message }, { status: missing(error) ? 409 : 500 })
    const added = data?.length ?? 0
    return NextResponse.json({ ok: true, added, already: rows.length - added, total: parsed.total, period: [parsed.period_from, parsed.period_to], bank: parsed.bank_name, warnings: parsed.warnings })
  }

  const id = String(b.id ?? '')
  const { data: line, error: lineErr } = await s.from('ops_bank_lines').select('*').eq('id', id).maybeSingle() as { data: any; error: any }
  if (lineErr) return NextResponse.json({ error: missing(lineErr) ? SETUP : lineErr.message }, { status: missing(lineErr) ? 409 : 500 })
  if (!line) return NextResponse.json({ error: 'That bank line wasn’t found' }, { status: 404 })

  if (b.action === 'undo') {
    if (line.status !== 'not_expense') return NextResponse.json({ error: 'Only a line marked “not an expense” can be put back. A filed expense is voided in Expenses.' }, { status: 409 })
    await s.from('ops_bank_lines').update({ status: 'new', filed_as: null, filed_by: null, filed_at: null, note: null }).eq('id', id).eq('status', 'not_expense')
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'no_receipt') {
    await s.from('ops_bank_lines').update({ no_receipt_needed: !!b.value }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'receipt_url') {
    const name = String(b.fileName ?? '')
    if (!OK_FILE.test(name)) return NextResponse.json({ error: 'Upload a PDF, photo, Word or Excel file' }, { status: 400 })
    if (!['landlord', 'split', 'company'].includes(line.filed_as)) return NextResponse.json({ error: 'File the line first' }, { status: 409 })
    const ext = name.split('.').pop()!.toLowerCase()
    // landlord expenses keep invoices in finance-docs (they can go to the landlord); company paperwork in capture
    const [bucket, path] = line.filed_as === 'company' ? ['capture', `ops/${id}.${ext}`] : ['finance-docs', `invoices/${String(line.line_date).slice(0, 7)}/ops-${id}.${ext}`]
    const { data, error } = await s.storage.from(bucket).createSignedUploadUrl(path, { upsert: true })
    if (error || !data) return NextResponse.json({ error: error?.message || 'Could not prepare the upload' }, { status: 500 })
    return NextResponse.json({ bucket, path, token: data.token })
  }

  if (b.action === 'receipt_done') {
    const path = String(b.path ?? ''), name = String(b.fileName ?? '').slice(0, 200) || null
    const okPath = line.filed_as === 'company' ? path.startsWith(`ops/${id}.`) : path.startsWith('invoices/') && path.includes(`ops-${id}.`)
    if (!okPath) return NextResponse.json({ error: 'That upload doesn’t belong to this line' }, { status: 400 })
    for (const ref of (line.filed_refs ?? []) as any[]) {
      if (ref.kind === 'expense') await s.from('recharge_expenses').update({ invoice_path: path, invoice_name: name }).eq('id', ref.id)
      if (ref.kind === 'company') await s.from('company_documents').update({ file_path: path, file_name: name }).eq('id', ref.id)
    }
    await s.from('ops_bank_lines').update({ receipt_path: path, receipt_name: name }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (b.action !== 'file') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const as = ['landlord', 'split', 'company', 'not_expense'].includes(b.as) ? b.as as 'landlord' | 'split' | 'company' | 'not_expense' : null
  if (!as) return NextResponse.json({ error: 'Choose house, split, company or not an expense' }, { status: 400 })
  if (line.status !== 'new') return NextResponse.json({ error: 'This line has already been filed' }, { status: 409 })
  const description = String(b.description ?? '').trim().slice(0, 300)
  const supplier = titleCase(line.payee_key || '')
  const cost = Number(line.amount)

  // check everything before claiming, so a refusal leaves the line as it was
  let splits: { propertyId: string; roomId: string | null; amount: number; charge: number; description: string }[] = []
  if (as === 'landlord') {
    if (!b.propertyId) return NextResponse.json({ error: 'Choose the house' }, { status: 400 })
    if (!description) return NextResponse.json({ error: 'Say what it was for' }, { status: 400 })
    const charge = b.charge == null || b.charge === '' ? cost : r2(Number(b.charge))
    if (!(charge > 0)) return NextResponse.json({ error: 'Enter what the landlord is charged' }, { status: 400 })
    splits = [{ propertyId: String(b.propertyId), roomId: b.roomId || null, amount: cost, charge, description }]
  }
  if (as === 'split') {
    splits = (Array.isArray(b.splits) ? b.splits : []).filter((x: any) => x?.propertyId).map((x: any) => {
      const amount = r2(Number(x.amount))
      return { propertyId: String(x.propertyId), roomId: x.roomId || null, amount, charge: x.charge == null || x.charge === '' ? amount : r2(Number(x.charge)), description: String(x.description || description).trim().slice(0, 300) }
    })
    if (splits.length < 2) return NextResponse.json({ error: 'A split needs at least two houses' }, { status: 400 })
    if (splits.some(x => !(x.amount > 0) || !(x.charge > 0))) return NextResponse.json({ error: 'Every house needs an amount' }, { status: 400 })
    if (new Set(splits.map(x => x.propertyId + (x.roomId ?? ''))).size !== splits.length) return NextResponse.json({ error: 'The same house is listed twice' }, { status: 400 })
    const sum = r2(splits.reduce((n, x) => n + x.amount, 0))
    if (sum !== r2(cost)) return NextResponse.json({ error: `The shares add up to £${sum.toFixed(2)} — they need to make £${cost.toFixed(2)}` }, { status: 400 })
    if (splits.some(x => !x.description)) return NextResponse.json({ error: 'Say what it was for' }, { status: 400 })
  }
  if (as === 'company' && !description) return NextResponse.json({ error: 'Say what it was for' }, { status: 400 })
  if ((as === 'landlord' || as === 'split') && !b.confirmDuplicate) {
    for (const x of splits) {
      const d = await expenseDuplicates(s, { property_id: x.propertyId, description: x.description, amount: x.charge, expense_date: line.line_date, invoice_number: null, room_id: x.roomId })
      if (d.length) return NextResponse.json({ duplicates: d.map(h => ({ ...h, house: x.propertyId })) }, { status: 409 })
    }
  }

  // claim the line: one person, one click
  const { data: claimed } = await s.from('ops_bank_lines').update({ status: 'filing' }).eq('id', id).eq('status', 'new').select('id')
  if (!claimed?.length) return NextResponse.json({ error: 'This line has just been filed by someone else' }, { status: 409 })
  const release = () => s.from('ops_bank_lines').update({ status: 'new' }).eq('id', id).eq('status', 'filing')
  const now = new Date().toISOString()
  const refs: any[] = []
  const messages: string[] = []

  try {
    if (as === 'not_expense') {
      await s.from('ops_bank_lines').update({ status: 'not_expense', filed_as: 'not_expense', note: String(b.note ?? '').slice(0, 300) || null, filed_by: admin.personId, filed_at: now }).eq('id', id)
    } else if (as === 'company') {
      const category = (COMPANY_CATEGORIES as readonly string[]).includes(String(b.category)) ? String(b.category) : 'Other'
      const { data: doc, error } = await s.from('company_documents').insert({
        title: description, category: 'bill', file_path: line.receipt_path ?? null, file_name: line.receipt_name ?? null, received_on: now.slice(0, 10),
        amount: cost, supplier: supplier || null, expense_date: line.line_date, expense_category: category, paid_on: line.line_date,
        source_ref: `ops:${id}`, created_by: admin.personId, notes: `Operations account: ${line.description}`.slice(0, 1000),
      }).select('id, cex_no').single()
      if (error) { await release(); return NextResponse.json({ error: /source_ref|file_path/.test(error.message) ? SETUP : error.message }, { status: 400 }) }
      refs.push({ kind: 'company', id: doc.id, no: doc.cex_no, amount: cost })
      messages.push(`Company expense ${doc.cex_no ?? ''} — £${cost.toFixed(2)}, ${category}`)
    } else {
      for (let n = 0; n < splits.length; n++) {
        const x = splits[n]
        const r = await addLandlordExpense(s, {
          property_id: x.propertyId, room_id: x.roomId, description: x.description, amount: x.charge, cost_amount: x.charge !== x.amount ? x.amount : null,
          expense_date: line.line_date, supplier, deduct_month: as === 'landlord' ? b.deductMonth || null : null,
          paid_to_supplier_on: line.line_date, invoice_path: line.receipt_path ?? null, invoice_name: line.receipt_name ?? null,
          notes: `Operations account${splits.length > 1 ? ` — ${n + 1} of ${splits.length} shares of £${cost.toFixed(2)}` : ''}: ${line.description}`.slice(0, 1000),
          source: 'ops_bank', source_ref: splits.length > 1 ? `ops:${id}:${n + 1}` : `ops:${id}`,
        }, { by: admin.personId, confirmDuplicate: true })   // duplicates were checked above, before anything was saved
        if (!r.ok) {
          if (!refs.length) { await release(); return NextResponse.json({ error: r.error ?? 'Could not add the expense' }, { status: r.status }) }
          // part of a split went in: keep what was made, and say plainly what didn't
          await s.from('ops_bank_lines').update({ status: 'filed', filed_as: as, filed_refs: refs, filed_by: admin.personId, filed_at: now, note: `Split incomplete: share ${n + 1} wasn’t added (${r.error})` }).eq('id', id)
          return NextResponse.json({ error: `Only ${refs.length} of ${splits.length} shares were added — share ${n + 1}: ${r.error}. Add the rest in Expenses.` }, { status: 409 })
        }
        refs.push({ kind: 'expense', id: r.expense.id, no: r.expense.txn_no, propertyId: x.propertyId, amount: x.charge, cost: x.amount })
        messages.push(r.message)
      }
    }
    if (as !== 'not_expense') await s.from('ops_bank_lines').update({ status: 'filed', filed_as: as, filed_refs: refs, filed_by: admin.personId, filed_at: now }).eq('id', id)
  } catch (e) {
    if (!refs.length) await release()
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not file it' }, { status: 500 })
  }

  // remember it for next month (unless told not to)
  if (b.remember !== false) {
    const { data: prev } = await s.from('ops_payee_rules').select('times_used').eq('match_key', line.match_key).maybeSingle()
    await s.from('ops_payee_rules').upsert({
      match_key: line.match_key, payee_key: line.payee_key, filed_as: as,
      property_id: as === 'landlord' ? splits[0].propertyId : null, room_id: as === 'landlord' ? splits[0].roomId : null,
      splits: as === 'split' ? splits.map(x => ({ propertyId: x.propertyId, roomId: x.roomId, share: r2(x.amount / cost), description: x.description })) : null,
      category: as === 'company' ? (COMPANY_CATEGORIES as readonly string[]).includes(String(b.category)) ? String(b.category) : 'Other' : null,
      description: description || splits[0]?.description || null, last_amount: cost, times_used: (prev?.times_used ?? 0) + 1,
      updated_by: admin.personId, updated_at: now,
    })
  }
  return NextResponse.json({ ok: true, filedTo: as === 'not_expense' ? 'Marked as not an expense' : messages.join(' · ') })
}
