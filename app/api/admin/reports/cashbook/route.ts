import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const to   = searchParams.get('to')   || new Date().toISOString().slice(0, 10)

  // Money IN — rent payments recorded on rent_charges
  const [chargesRes, expensesRes, bankRes] = await Promise.all([
    supabase
      .from('rent_charges')
      .select(`
        id, charge_month, amount_due, amount_received, status, paid_at, payment_method,
        room:rooms(name,
          property:properties(id, name, address)
        )
      `)
      .not('amount_received', 'is', null)
      .gt('amount_received', 0)
      .gte('paid_at', from)
      .lte('paid_at', to + 'T23:59:59')
      .order('paid_at', { ascending: true }),

    supabase
      .from('recharge_expenses')
      .select(`
        id, description, amount, expense_date, source,
        property:properties(id, name, address)
      `)
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('expense_date', { ascending: true }),

    supabase
      .from('bank_transactions')
      .select('id, transaction_date, description, amount, matched_rent_charge_id, imported_at')
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('transaction_date', { ascending: true }),
  ])

  const receipts = (chargesRes.data || []).map((r: any) => ({
    type:        'receipt' as const,
    date:        r.paid_at?.slice(0, 10) || r.charge_month,
    description: `Rent — ${r.room?.property?.name || 'Property'} ${r.room?.name || ''}`.trim(),
    property:    r.room?.property?.name || r.room?.property?.address || '—',
    amount_in:   Number(r.amount_received),
    amount_out:  0,
    ref:         r.id,
  }))

  const payments = (expensesRes.data || []).map((r: any) => ({
    type:        'payment' as const,
    date:        r.expense_date,
    description: r.description || r.source || 'Expense',
    property:    r.property?.name || r.property?.address || '—',
    amount_in:   0,
    amount_out:  Number(r.amount),
    ref:         r.id,
  }))

  const allEntries = [...receipts, ...payments].sort((a, b) => a.date.localeCompare(b.date))

  // Running balance
  let balance = 0
  const entries = allEntries.map(e => {
    balance += e.amount_in - e.amount_out
    return { ...e, running_balance: balance }
  })

  // Unmatched bank transactions (imported but not yet allocated)
  const unmatched = (bankRes.data || []).filter((t: any) => !t.matched_rent_charge_id).map((t: any) => ({
    id:          t.id,
    date:        t.transaction_date,
    description: t.description,
    amount:      Number(t.amount),
  }))

  const totals = {
    total_in:    receipts.reduce((s, r) => s + r.amount_in, 0),
    total_out:   payments.reduce((s, r) => s + r.amount_out, 0),
    net:         receipts.reduce((s, r) => s + r.amount_in, 0) - payments.reduce((s, r) => s + r.amount_out, 0),
    bank_total:  (bankRes.data || []).reduce((s: number, t: any) => s + Number(t.amount), 0),
  }

  return NextResponse.json({ from, to, entries, unmatched, totals })
}
