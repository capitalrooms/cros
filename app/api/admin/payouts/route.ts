// Payout run (landlords are paid on the 5th).
// GET                              statements not yet paid: amount, landlord balance held, bank details
// GET  ?export=csv&ids=a,b         bank payment file for the chosen statements
// POST { action: 'mark_paid', ids, paidDate }  record the payment — refused if it would take a landlord's
//                                  client ledger below zero (statements dated from the ledger start)
// POST { action: 'mark_historic', ids }  statements from before the ledger start (imported from the old system)
//                                  that were paid outside CROS: record them paid on their statement date
//
// Rows dated before the ledger start come back with older: true — they are history, not money owed, and the
// page keeps them out of the payout run. suspect: true flags figures that look like a misread import.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { contentDisposition } from '@/lib/contentDisposition'
import { demoPropertyIds } from '@/lib/demoProperties'
import { loadLedger, landlordBalances } from '@/lib/clientLedger'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

async function unpaid(s: SupabaseClient) {
  const [{ data: sts, error }, demo, ledger] = await Promise.all([
    s.from('landlord_statements').select('id, landlord_id, property_id, statement_reference, statement_date, net_to_landlord, sent_at, properties(name)').is('paid_date', null).order('statement_date'),
    demoPropertyIds(s),
    loadLedger(s),
  ])
  if (error) throw new Error(error.message)
  const balances = new Map((await landlordBalances(s, ledger.entries)).map(b => [b.landlordId ?? 'none', b.balance]))
  const rows = (sts ?? []).filter((x: any) => !demo.has(x.property_id) && Number(x.net_to_landlord) > 0)
  const ids = [...new Set(rows.map((x: any) => x.landlord_id).filter(Boolean))] as string[]
  const [{ data: people }, { data: banks }] = await Promise.all([
    ids.length ? s.from('people').select('id, first_name, last_name, full_name, company').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? s.from('landlord_bank_accounts').select('landlord_id, account_name, sort_code, account_number, is_default').in('landlord_id', ids) : Promise.resolve({ data: [] as any[] }),
  ])
  const name = new Map((people ?? []).map((p: any) => [p.id, p.company || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name]))
  const bankFor = (id: string) => ((banks ?? []) as any[]).filter(b => b.landlord_id === id).sort((a, b) => Number(b.is_default) - Number(a.is_default))[0] ?? null
  return rows.map((x: any) => {
    const bank = x.landlord_id ? bankFor(x.landlord_id) : null
    const inLedger = String(x.statement_date || '') >= ledger.start
    const amount = r2(Number(x.net_to_landlord))
    return {
      older: !inLedger,
      // an import that read a whole-year or whole-portfolio document as one month, or a far-past date
      suspect: amount > 20000 || String(x.statement_date || '') < '2024-01-01',
      id: x.id, landlordId: x.landlord_id, landlord: name.get(x.landlord_id) || 'No landlord', property: String(x.properties?.name || '').split('\n')[0],
      reference: x.statement_reference, statementDate: x.statement_date, amount, sent: !!x.sent_at,
      held: inLedger ? r2(balances.get(x.landlord_id ?? 'none') ?? 0) : null,   // null = before the ledger start, not checked
      bank: bank ? { name: bank.account_name, sortCode: bank.sort_code, accountNo: bank.account_number } : null,
    }
  })
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  try {
    const rows = await unpaid(s)
    if (req.nextUrl.searchParams.get('export') === 'csv') {
      const want = new Set((req.nextUrl.searchParams.get('ids') || '').split(',').filter(Boolean))
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const lines = [['Payee name', 'Sort code', 'Account number', 'Amount', 'Reference'].map(q).join(',')]
      for (const r of rows.filter(r => want.has(r.id))) {
        lines.push([r.bank?.name ?? '', (r.bank?.sortCode ?? '').replace(/\D/g, ''), (r.bank?.accountNo ?? '').replace(/\D/g, ''), r.amount.toFixed(2), `CR ${r.reference}`.slice(0, 18)].map(q).join(','))
      }
      return new NextResponse(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': contentDisposition(`Landlord payouts ${new Date().toISOString().slice(0, 10)}.csv`) } })
    }
    return NextResponse.json({ rows })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load payouts' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'mark_paid' && b.action !== 'mark_historic') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const paidDate = /^\d{4}-\d{2}-\d{2}$/.test(b.paidDate || '') ? b.paidDate : new Date().toISOString().slice(0, 10)
  const s = svc()
  if (b.action === 'mark_historic') {
    const old = (await unpaid(s)).filter(r => r.older && (b.ids ?? []).includes(r.id))
    if (!old.length) return NextResponse.json({ error: 'Pick at least one older statement.' }, { status: 400 })
    for (const r of old) {
      const { error } = await s.from('landlord_statements').update({ paid_date: r.statementDate, amount_paid: r.amount }).eq('id', r.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, paid: old.length, total: r2(old.reduce((t, r) => t + r.amount, 0)) })
  }
  const rows = (await unpaid(s)).filter(r => (b.ids ?? []).includes(r.id))
  if (!rows.length) return NextResponse.json({ error: 'Pick at least one statement.' }, { status: 400 })

  // Client money rule: never pay a landlord more than is held for them.
  const byLandlord = new Map<string, { held: number | null; total: number; name: string }>()
  for (const r of rows) {
    const k = r.landlordId ?? 'none'
    const g = byLandlord.get(k) ?? { held: r.held, total: 0, name: r.landlord }
    g.total = r2(g.total + r.amount); byLandlord.set(k, g)
  }
  const short = [...byLandlord.values()].filter(g => g.held != null && g.total > g.held + 0.005)
  if (short.length) {
    return NextResponse.json({ error: `Not enough held to pay ${short.map(g => `${g.name} (paying £${g.total.toFixed(2)}, held £${(g.held ?? 0).toFixed(2)})`).join('; ')}. Record the rent received first, or add an opening balance on Client money.` }, { status: 409 })
  }
  for (const r of rows) {
    const { error } = await s.from('landlord_statements').update({ paid_date: paidDate, amount_paid: r.amount }).eq('id', r.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, paid: rows.length, total: r2(rows.reduce((t, r) => t + r.amount, 0)) })
}
