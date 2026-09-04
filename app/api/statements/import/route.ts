import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import type { ExtractedStatement } from '@/lib/ai-statement'

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    statement: ExtractedStatement
    property_id: string
    landlord_id: string
  }
  const { statement: s, property_id, landlord_id } = body

  if (!s || !property_id || !landlord_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()

  // Duplicate guard — same reference + property
  if (s.statement_reference) {
    const { data: existing } = await supabase
      .from('landlord_statements')
      .select('id')
      .eq('property_id', property_id)
      .eq('statement_reference', s.statement_reference)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `Statement ${s.statement_reference} already exists for this property`, duplicate: true },
        { status: 409 }
      )
    }
  }

  // Insert the header row
  const { data: stmt, error: stmtErr } = await supabase
    .from('landlord_statements')
    .insert({
      property_id,
      landlord_id,
      statement_reference: s.statement_reference || null,
      statement_date: s.statement_date || null,
      period_start: s.period_start || null,
      period_end: s.period_end || null,
      gross_rent: s.gross_rent || 0,
      management_fees: s.management_fees || 0,
      property_charges: s.property_charges || 0,
      net_to_landlord: s.net_to_landlord || 0,
      paid_date: s.paid_date || null,
    })
    .select('id')
    .single()

  if (stmtErr || !stmt) {
    return NextResponse.json({ error: stmtErr?.message || 'Failed to create statement' }, { status: 500 })
  }

  // Insert line items for each expense
  if (s.expenses && s.expenses.length > 0) {
    const lineItems = s.expenses.map(e => ({
      statement_id: stmt.id,
      property_id,
      landlord_id,
      category: e.category || 'other_property',
      room_label: e.room_label || null,
      description: e.description,
      amount: e.amount,
      ai_confidence: s.confidence ?? null,
      admin_confirmed: false,
    }))

    const { error: liErr } = await supabase.from('statement_line_items').insert(lineItems)
    if (liErr) {
      // Don't fail the whole import — statement header is already saved
      console.error('Line item insert error:', liErr.message)
    }
  }

  return NextResponse.json({ success: true, statement_id: stmt.id })
}
