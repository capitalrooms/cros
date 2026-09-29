/**
 * GET /api/admin/financial-trail?type=rent_charge&id=...
 *                               ?type=expense&id=...
 *                               ?type=statement_room&id=...
 *                               ?type=bank_transaction&id=...
 *
 * Returns the complete source chain for any financial figure.
 * Used by the <FinancialTrail> component to show "where did this come from?"
 * when an admin clicks any amount in the system.
 *
 * RENT trail:
 *   bank_transaction → rent_charge → landlord_statement_rooms → landlord_statement
 *
 * EXPENSE trail:
 *   recharge_expense → statement_line_item → landlord_statement
 *
 * MANAGEMENT FEE trail:
 *   landlord_statement_room → landlord_statement
 *
 * STATEMENT trail:
 *   landlord_statement → all linked rooms + expenses
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase
    .from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const id   = searchParams.get('id')
  if (!type || !id) return NextResponse.json({ error: 'type and id required' }, { status: 400 })

  // ─── RENT CHARGE ────────────────────────────────────────────────────────────
  if (type === 'rent_charge') {
    const { data: charge } = await supabase
      .from('rent_charges')
      .select(`
        *,
        room:rooms ( name, properties ( id, name, address, property_code ) ),
        bank_transaction:bank_transactions!rent_charges_bank_transaction_id_fkey (
          id, transaction_date, amount, description, extracted_ref, status,
          batch:bank_import_batches ( filename, period_from, period_to, imported_at )
        ),
        payer:people!paid_by ( first_name, last_name ),
        statement_rooms:landlord_statement_rooms (
          id, rent_income, management_fee, net_to_landlord,
          statement:landlord_statements (
            id, statement_reference, reference, statement_date, period_start, period_end,
            properties ( name, address )
          )
        ),
        audit:payment_audit_log ( action, performed_at, old_value, new_value, note )
      `)
      .eq('id', id)
      .single()
    if (!charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: 'rent_charge', data: charge })
  }

  // ─── EXPENSE ────────────────────────────────────────────────────────────────
  if (type === 'expense') {
    const { data: expense } = await supabase
      .from('recharge_expenses')
      .select(`
        *,
        property:properties ( id, name, address, property_code ),
        statement_line:statement_line_items!recharge_expenses_statement_line_item_id_fkey (
          id, category, amount, description, date:statement_date,
          statement:landlord_statements (
            id, statement_reference, reference, statement_date, period_start, period_end
          )
        )
      `)
      .eq('id', id)
      .single()
    if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Also find any statement_line_items that match this expense by amount+description
    // (for expenses logged before the linkage columns existed)
    let inferredStatement = null
    if (!expense.statement_line?.length) {
      const { data: matched } = await supabase
        .from('statement_line_items')
        .select(`
          id, category, amount, description, date:statement_date,
          statement:landlord_statements (
            id, statement_reference, reference, statement_date, period_start, period_end
          )
        `)
        .eq('amount', expense.amount)
        .ilike('description', `%${expense.description.slice(0, 20)}%`)
        .limit(3)
      inferredStatement = matched || []
    }

    return NextResponse.json({ type: 'expense', data: { ...expense, inferred_statement_lines: inferredStatement } })
  }

  // ─── STATEMENT ROOM LINE (management fee / rent) ─────────────────────────
  if (type === 'statement_room') {
    const { data: row } = await supabase
      .from('landlord_statement_rooms')
      .select(`
        *,
        statement:landlord_statements (
          id, statement_reference, reference, statement_date, period_start, period_end,
          properties ( name, address )
        ),
        room:rooms ( name ),
        tenant:people!landlord_statement_rooms_tenant_id_fkey ( first_name, last_name ),
        rent_charge:rent_charges (
          id, charge_month, amount_due, amount_received, status,
          bank_transaction:bank_transactions!rent_charges_bank_transaction_id_fkey (
            id, transaction_date, amount, description, extracted_ref,
            batch:bank_import_batches ( filename, period_from, period_to )
          )
        )
      `)
      .eq('id', id)
      .single()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: 'statement_room', data: row })
  }

  // ─── BANK TRANSACTION ───────────────────────────────────────────────────────
  if (type === 'bank_transaction') {
    const { data: txn } = await supabase
      .from('bank_transactions')
      .select(`
        *,
        batch:bank_import_batches ( filename, bank_name, period_from, period_to, imported_at ),
        rent_charge:rent_charges!bank_transactions_matched_rent_charge_id_fkey (
          id, charge_month, amount_due, amount_received, status,
          room:rooms ( name, properties ( name, address ) ),
          statement_rooms:landlord_statement_rooms (
            statement:landlord_statements ( id, statement_reference, reference, statement_date )
          )
        )
      `)
      .eq('id', id)
      .single()
    if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: 'bank_transaction', data: txn })
  }

  return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
}
