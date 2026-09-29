import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { ExtractedStatement } from '@/lib/ai-statement'
import { requireAdmin } from '@/lib/adminAuth'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const body = await req.json() as {
    statement: ExtractedStatement
    property_id: string
    landlord_id: string
    /** paid to the landlord outside CROS (by 10ninety) — record it paid so it never shows as owed on Payouts */
    paid_outside?: boolean
    /** import even though this property already has a statement in that month */
    allow_same_month?: boolean
  }
  const { statement: s, property_id, landlord_id, paid_outside, allow_same_month } = body

  if (!s || !property_id || !landlord_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  // One statement per property per month, unless the admin has said this second one is deliberate
  const date = /^\d{4}-\d{2}-\d{2}/.test(s.statement_date || '') ? s.statement_date.slice(0, 10) : null
  if (date && !allow_same_month) {
    const [y, m] = date.slice(0, 7).split('-').map(Number)
    const { data: same } = await supabase.from('landlord_statements').select('id, statement_reference')
      .eq('property_id', property_id).gte('statement_date', `${date.slice(0, 7)}-01`).lte('statement_date', new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)).limit(1)
    if (same?.length) return NextResponse.json({ error: `This property already has a statement for ${new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}${same[0].statement_reference ? ` (${same[0].statement_reference})` : ''}.`, duplicate: true }, { status: 409 })
  }
  const paidDate = paid_outside ? ((/^\d{4}-\d{2}-\d{2}/.test(s.paid_date || '') ? s.paid_date.slice(0, 10) : null) ?? date) : (s.paid_date || null)

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
      paid_date: paidDate,
      ...(paid_outside ? { amount_paid: s.amount_paid || s.net_to_landlord || 0 } : {}),
      rooms: s.rooms?.length ? s.rooms : null,
      expenses: s.expenses?.length ? s.expenses : null,
    })
    .select('id')
    .single()

  if (stmtErr || !stmt) {
    return NextResponse.json({ error: stmtErr?.message || 'Failed to create statement' }, { status: 500 })
  }

  const warnings: string[] = []

  // Insert per-room rent rows, resolving room_id + tenant_id from active tenancies
  if (s.rooms && s.rooms.length > 0) {
    // Fetch rooms for this property ordered by their name so we can match by position/number
    const { data: propertyRooms } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('property_id', property_id)
      .order('name')

    // Fetch tenancies active during the statement period, scoped to this property's rooms
    const roomIds = (propertyRooms || []).map(r => r.id)
    const { data: activeTenancies } = s.period_start && s.period_end && roomIds.length > 0
      ? await supabase
          .from('tenancies')
          .select('id, room_id, person_id, start_date, end_date')
          .in('room_id', roomIds)
          .lte('start_date', s.period_end)
          .or(`end_date.is.null,end_date.gte.${s.period_start}`)
      : { data: [] }

    // Build room_number → room row map (1-indexed position in sorted list)
    const roomByNumber = new Map<number, { id: string; name: string }>()
    ;(propertyRooms || []).forEach(r => { const n = parseInt(String(r.name).match(/\d+/)?.[0] ?? ''); if (n && !roomByNumber.has(n)) roomByNumber.set(n, r) })
    ;(propertyRooms || []).forEach((r, i) => { if (!roomByNumber.has(i + 1) && ![...roomByNumber.values()].includes(r)) roomByNumber.set(i + 1, r) })

    // Build room_id → tenancy map
    const tenancyByRoom = new Map<string, { id: string; person_id: string }>()
    ;(activeTenancies || []).forEach(t => {
      if (t.room_id) tenancyByRoom.set(t.room_id, { id: t.id, person_id: t.person_id })
    })

    const roomRows = s.rooms.map(r => {
      const room = roomByNumber.get(r.room_number)
      const tenancy = room ? tenancyByRoom.get(room.id) : undefined
      const resolved = !!(room && tenancy)
      return {
        statement_id: stmt.id,
        property_id,
        room_id: room?.id ?? null,
        tenant_id: tenancy?.person_id ?? null,
        tenancy_id: tenancy?.id ?? null,
        room_number: r.room_number,
        tenant_name: r.tenant_name,
        rent_income: r.rent_income,
        management_fee: r.management_fee,
        net_to_landlord: r.rent_income - r.management_fee,
        needs_review: !resolved,
      }
    })

    const { error: roomErr } = await supabase.from('landlord_statement_rooms').insert(roomRows)
    if (roomErr) warnings.push(`Room lines weren’t saved: ${roomErr.message}`)
    if (roomErr) {
      console.error('Room rows insert error:', roomErr.message)
    }
  }

  // Insert line items for each expense
  if (s.expenses && s.expenses.length > 0) {
    const lineItems = s.expenses.map(e => ({
      statement_id: stmt.id,
      property_id,
      landlord_id,
      category: e.category || 'other_property',
      room_label: e.room_label || null,
      statement_date: date ?? s.statement_date,     // required — without it every expense line was rejected
      period_start: s.period_start || null,
      period_end: s.period_end || null,
      description: e.description,
      amount: e.amount,
      ai_confidence: s.confidence ?? null,
      admin_confirmed: false,
    }))

    const { error: liErr } = await supabase.from('statement_line_items').insert(lineItems)
    if (liErr) warnings.push(`Expense lines weren’t saved: ${liErr.message}`)
    if (liErr) {
      // Don't fail the whole import — statement header is already saved
      console.error('Line item insert error:', liErr.message)
    }
  }

  return NextResponse.json({ success: true, statement_id: stmt.id, warnings })
}
