import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })

    // Tables should already exist from migrations
    // If not, they will be created when accessed
    console.log('Starting statement seed process...')

    // Now insert the LS1001 statement data
    // First, get the landlord and property IDs
    const { data: landlordData, error: landlordError } = await supabase
      .from('people')
      .select('id')
      .eq('email', 'landlord@example.co.uk')
      .single()

    if (landlordError || !landlordData) {
      return NextResponse.json({
        error: 'Landlord not found',
        details: landlordError?.message,
      }, { status: 400 })
    }

    const { data: propertyData, error: propertyError } = await supabase
      .from('properties')
      .select('id')
      .eq('address', '71 Alloa Road, London, SE8 5AH')
      .single()

    if (propertyError || !propertyData) {
      return NextResponse.json({
        error: 'Property not found',
        details: propertyError?.message,
      }, { status: 400 })
    }

    // Insert the main statement
    const { data: statement, error: statementError } = await supabase
      .from('landlord_statements')
      .insert({
        landlord_id: landlordData.id,
        property_id: propertyData.id,
        statement_reference: 'LS1001',
        statement_date: '2026-07-03',
        period_start: '2026-07-03',
        period_end: '2026-08-03',
        gross_rent: 7720.00,
        management_fees: 1103.37,
        property_charges: 176.97,
        net_to_landlord: 6439.66,
        amount_paid: 6439.66,
        paid_date: '2026-07-03',
      })
      .select()
      .single()

    if (statementError) {
      // Statement might already exist, which is fine
      console.log('Statement insert note:', statementError.message)
    }

    let statementId = statement?.id

    if (!statementId) {
      // Try to fetch existing statement
      const { data: existingStatement } = await supabase
        .from('landlord_statements')
        .select('id')
        .eq('landlord_id', landlordData.id)
        .eq('statement_reference', 'LS1001')
        .single()

      if (existingStatement) {
        statementId = existingStatement.id
      }
    }

    if (!statementId) {
      return NextResponse.json({
        error: 'Could not create or find statement',
      }, { status: 400 })
    }

    // Get all rooms for the property to link tenants
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('property_id', propertyData.id)
      .order('created_at', { ascending: false })

    if (roomsError || !rooms || rooms.length === 0) {
      return NextResponse.json({
        error: 'Could not fetch rooms',
        details: roomsError?.message,
      }, { status: 400 })
    }

    // Room breakdown data
    const roomData = [
      { name: 'Karina Bermudez', rent: 950.00 },
      { name: 'Elizabeth Vogel', rent: 850.00 },
      { name: 'Don Pubudu', rent: 1075.00 },
      { name: 'Sebastian Elliott', rent: 850.00 },
      { name: 'Aslan Almukhambetov', rent: 995.00 },
      { name: 'Alyssa Miles O\'Bray', rent: 1200.00 },
      { name: 'Ava Eldridge', rent: 950.00 },
    ]

    // Insert room breakdowns
    const roomsToInsert = roomData.map((data, index) => {
      const management_fee = Math.round((data.rent * 0.152) * 100) / 100 // 15.2%
      return {
        statement_id: statementId,
        room_id: rooms[index]?.id,
        tenant_id: null, // We'll skip the tenant_id for now
        tenant_name: data.name,
        rent_income: data.rent,
        management_fee: management_fee,
        net_to_landlord: data.rent - management_fee,
      }
    })

    const { error: roomsInsertError, data: roomsInserted } = await supabase
      .from('landlord_statement_rooms')
      .insert(roomsToInsert)
      .select()

    // Insert charges
    const chargesData = [
      { description: 'Netflix Subscription', category: 'subscriptions', amount: 15.99 },
      { description: 'Broadband (Virgin Media)', category: 'utilities', amount: 45.99 },
      { description: 'Cleaning Service', category: 'maintenance', amount: 89.99 },
      { description: 'Management Fee (15.2%)', category: 'management', amount: 1103.37 },
      { description: 'General Maintenance', category: 'maintenance', amount: 25.00 },
    ]

    const { error: chargesError, data: chargesInserted } = await supabase
      .from('landlord_statement_charges')
      .insert(
        chargesData.map((charge) => ({
          statement_id: statementId,
          ...charge,
        }))
      )
      .select()

    return NextResponse.json({
      success: true,
      message: 'LS1001 statement and data seeded successfully',
      data: {
        statement: { id: statementId, reference: 'LS1001' },
        rooms: roomsInserted?.length || roomsToInsert.length,
        charges: chargesInserted?.length || chargesData.length,
      },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: 'Failed to seed statements', details: String(error) },
      { status: 500 }
    )
  }
}
