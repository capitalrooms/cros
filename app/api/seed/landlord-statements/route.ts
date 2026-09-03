import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

/**
 * Seed sample landlord statement data for testing
 * This matches the LS1001 statement structure from the PDF
 *
 * POST /api/seed/landlord-statements
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient()

    // Get landlord user (should have existing test landlord)
    const { data: landlord } = await supabase
      .from('people')
      .select('id')
      .eq('role', 'landlord')
      .single()

    if (!landlord) {
      return NextResponse.json(
        { error: 'No landlord found. Create a landlord user first.' },
        { status: 400 }
      )
    }

    // Get test property (71 Alloa Road or similar)
    const { data: property } = await supabase
      .from('properties')
      .select('id, name, address')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!property) {
      return NextResponse.json(
        { error: 'No property found. Create a property first.' },
        { status: 400 }
      )
    }

    // Get tenants for the property's rooms
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select(`
        id,
        room_id,
        tenant_id,
        people (full_name, first_name, last_name)
      `)
      .eq('property_id', property.id)
      .order('room_id')

    if (!tenancies || tenancies.length === 0) {
      return NextResponse.json(
        { error: 'No tenancies found. Assign tenants to rooms first.' },
        { status: 400 }
      )
    }

    // Create statement for July 2026 (based on PDF date: 03 July 2026)
    const { data: statement, error: stmtError } = await supabase
      .from('landlord_statements')
      .insert({
        landlord_id: landlord.id,
        property_id: property.id,
        statement_reference: 'LS1001',
        statement_date: '2026-07-03',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
        gross_rent: 7720.0,
        management_fees: 1103.37,
        property_charges: 176.97,
        net_to_landlord: 6616.63,
        amount_paid: 6616.63,
        paid_date: '2026-07-03',
      })
      .select()
      .single()

    if (stmtError) {
      console.error('Statement creation error:', stmtError)
      return NextResponse.json(
        { error: 'Failed to create statement', details: stmtError.message },
        { status: 400 }
      )
    }

    // Add room breakdown items (matching PDF data)
    const roomRents = [
      { name: 'Miss Karina Bermudez', rent: 950.0 },
      { name: 'Miss Elizabeth Vogel', rent: 850.0 },
      { name: 'Mr Don Pubudu', rent: 1075.0 },
      { name: 'Mr Sebastian Elliott', rent: 850.0 },
      { name: 'Mr Aslan Almukhambetov', rent: 995.0 },
      { name: 'Miss Alyssa Miles O\'Bray', rent: 1200.0 },
      { name: 'Miss Ava Eldridge', rent: 950.0 },
    ]

    const roomItems = tenancies.slice(0, roomRents.length).map((tenancy, idx) => {
      const rent = roomRents[idx]?.rent || 0
      const fee = Math.round(rent * 0.12 * 100) / 100
      return {
        statement_id: statement.id,
        room_id: tenancy.room_id,
        tenant_id: tenancy.tenant_id,
        tenant_name: roomRents[idx]?.name || tenancy.people.name,
        rent_income: rent,
        management_fee: fee,
        net_to_landlord: rent - fee,
      }
    })

    const { error: roomsError } = await supabase.from('landlord_statement_rooms').insert(roomItems)

    if (roomsError) {
      console.error('Rooms creation error:', roomsError)
      return NextResponse.json(
        { error: 'Failed to create room items', details: roomsError.message },
        { status: 400 }
      )
    }

    // Add property-level charges (matching PDF)
    const charges = [
      { description: 'Netflix', category: 'subscriptions', amount: 18.99 },
      { description: 'AO washing machine appliance cover', category: 'maintenance', amount: 5.99 },
      { description: 'Community Fibre Broadband 1Gbps', category: 'utilities', amount: 32.0 },
      { description: '6 hours cleaning', category: 'cleaning', amount: 90.0 },
      { description: 'Weedkiller for property', category: 'maintenance', amount: 29.99 },
    ]

    const chargesWithStatement = charges.map((c) => ({
      ...c,
      statement_id: statement.id,
    }))

    const { error: chargesError } = await supabase
      .from('landlord_statement_charges')
      .insert(chargesWithStatement)

    if (chargesError) {
      console.error('Charges creation error:', chargesError)
      return NextResponse.json(
        { error: 'Failed to create charges', details: chargesError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Sample statement created successfully',
      statement: {
        reference: statement.statement_reference,
        property: property.name,
        date: statement.statement_date,
        gross_rent: statement.gross_rent,
        management_fees: statement.management_fees,
        property_charges: statement.property_charges,
        net_to_landlord: statement.net_to_landlord,
      },
      rooms_created: roomItems.length,
      charges_created: charges.length,
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: 'Failed to seed data', details: String(error) },
      { status: 500 }
    )
  }
}
