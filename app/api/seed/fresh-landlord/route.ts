import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

/**
 * Fresh landlord setup seed
 * Creates:
 * - 1 landlord auth user + person record
 * - 7 tenant auth users + person records
 * - 1 property (71 Alloa Road)
 * - 7 rooms
 * - 7 tenancies
 *
 * POST /api/seed/fresh-landlord
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient()

    // First, clean up old test data
    await supabase
      .from('people')
      .delete()
      .in('email', [
        'landlord@example.co.uk',
        'karina@example.com',
        'elizabeth@example.com',
        'don@example.com',
        'sebastian@example.com',
        'aslan@example.com',
        'alyssa@example.com',
        'ava@example.com',
      ])

    // Define users to create
    const usersToCreate = [
      {
        email: 'landlord@example.co.uk',
        password: '123',
        fullName: 'Capital Rooms Landlord',
        role: 'landlord',
      },
      {
        email: 'karina@example.com',
        password: '123',
        fullName: 'Karina Bermudez',
        role: 'tenant',
      },
      {
        email: 'elizabeth@example.com',
        password: '123',
        fullName: 'Elizabeth Vogel',
        role: 'tenant',
      },
      {
        email: 'don@example.com',
        password: '123',
        fullName: 'Don Pubudu',
        role: 'tenant',
      },
      {
        email: 'sebastian@example.com',
        password: '123',
        fullName: 'Sebastian Elliott',
        role: 'tenant',
      },
      {
        email: 'aslan@example.com',
        password: '123',
        fullName: 'Aslan Almukhambetov',
        role: 'tenant',
      },
      {
        email: 'alyssa@example.com',
        password: '123',
        fullName: "Alyssa Miles O'Bray",
        role: 'tenant',
      },
      {
        email: 'ava@example.com',
        password: '123',
        fullName: 'Ava Eldridge',
        role: 'tenant',
      },
    ]

    // Create users and get their IDs
    const createdUsers: { email: string; id: string; role: string; fullName: string }[] = []

    // We'll use the admin API via Supabase service role
    // For testing, we'll create records directly in the people table with NULL auth_ids
    // In production, you'd use the admin API to create auth users first

    // Create landlord person record (without auth_id for now)
    const { data: landlord, error: landlordError } = await supabase
      .from('people')
      .insert({
        full_name: 'Capital Rooms Landlord',
        email: 'landlord@example.co.uk',
        phone: '020 7946 0958',
        role: 'landlord',
      })
      .select()
      .single()

    if (landlordError) {
      console.error('Landlord creation error:', landlordError)
      return NextResponse.json(
        { error: 'Failed to create landlord', details: landlordError.message },
        { status: 400 }
      )
    }

    // Create property
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .insert({
        name: '071ALR',
        address: '71 Alloa Road, London, SE8 5AH',
        bedrooms: 7,
        bathrooms: 2,
      })
      .select()
      .single()

    if (propertyError) {
      console.error('Property creation error:', propertyError)
      return NextResponse.json(
        { error: 'Failed to create property', details: propertyError.message },
        { status: 400 }
      )
    }

    // Create rooms with matching rents
    const roomsData = [
      { name: 'Room 1', rent: 950.0 },
      { name: 'Room 2', rent: 850.0 },
      { name: 'Room 3', rent: 1075.0 },
      { name: 'Room 4', rent: 850.0 },
      { name: 'Room 5', rent: 995.0 },
      { name: 'Room 6', rent: 1200.0 },
      { name: 'Room 7', rent: 950.0 },
    ]

    const roomsToCreate = roomsData.map((r) => ({
      property_id: property.id,
      name: r.name,
      status: 'occupied' as const,
      current_asking_rent: r.rent,
    }))

    const { data: roomsCreated, error: roomsError } = await supabase
      .from('rooms')
      .insert(roomsToCreate)
      .select()

    if (roomsError) {
      console.error('Rooms creation error:', roomsError)
      return NextResponse.json(
        { error: 'Failed to create rooms', details: roomsError.message },
        { status: 400 }
      )
    }

    // Create tenant person records
    const tenantEmails = [
      { email: 'karina@example.com', name: 'Karina Bermudez' },
      { email: 'elizabeth@example.com', name: 'Elizabeth Vogel' },
      { email: 'don@example.com', name: 'Don Pubudu' },
      { email: 'sebastian@example.com', name: 'Sebastian Elliott' },
      { email: 'aslan@example.com', name: 'Aslan Almukhambetov' },
      { email: 'alyssa@example.com', name: "Alyssa Miles O'Bray" },
      { email: 'ava@example.com', name: 'Ava Eldridge' },
    ]

    const { data: tenantsCreated, error: tenantsError } = await supabase
      .from('people')
      .insert(
        tenantEmails.map((t) => ({
          full_name: t.name,
          email: t.email,
          role: 'tenant',
        }))
      )
      .select()

    if (tenantsError) {
      console.error('Tenants creation error:', tenantsError)
      return NextResponse.json(
        { error: 'Failed to create tenants', details: tenantsError.message },
        { status: 400 }
      )
    }

    // Create tenancy records linking tenants to rooms
    const tenanciesData = [
      { tenantEmail: 'karina@example.com', roomIndex: 0, monthlyRent: 4115.0 },
      { tenantEmail: 'elizabeth@example.com', roomIndex: 1, monthlyRent: 3680.5 },
      { tenantEmail: 'don@example.com', roomIndex: 2, monthlyRent: 4655.75 },
      { tenantEmail: 'sebastian@example.com', roomIndex: 3, monthlyRent: 3680.5 },
      { tenantEmail: 'aslan@example.com', roomIndex: 4, monthlyRent: 4309.35 },
      { tenantEmail: 'alyssa@example.com', roomIndex: 5, monthlyRent: 5196.0 },
      { tenantEmail: 'ava@example.com', roomIndex: 6, monthlyRent: 4115.0 },
    ]

    const tenanciesInsert = tenanciesData.map((t) => ({
      room_id: roomsCreated[t.roomIndex].id,
      tenant_id: tenantsCreated.find((tenant) => tenant.email === t.tenantEmail)?.id,
      start_date: '2026-08-01',
      rent_monthly: t.monthlyRent,
      communication_preference: 'email',
      opt_in_maintenance: true,
      opt_in_viewings: false,
      opt_in_appointments: true,
      opt_in_cleaning: true,
    }))

    const { error: tenanciesError } = await supabase
      .from('tenancies')
      .insert(tenanciesInsert)

    if (tenanciesError) {
      console.error('Tenancies creation error:', tenanciesError)
      return NextResponse.json(
        { error: 'Failed to create tenancies', details: tenanciesError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Fresh landlord setup created successfully',
      data: {
        landlord: {
          email: landlord.email,
          name: landlord.full_name,
          id: landlord.id,
        },
        property: {
          name: property.name,
          address: property.address,
          rooms: roomsCreated.length,
          id: property.id,
        },
        tenants: tenantsCreated.length,
        tenancies: tenanciesInsert.length,
      },
      nextSteps: [
        'Create auth users in Supabase Auth tab for:',
        '  - landlord@example.co.uk (password: 123)',
        '  - karina@example.com (password: 123)',
        '  - elizabeth@example.com (password: 123)',
        '  - don@example.com (password: 123)',
        '  - sebastian@example.com (password: 123)',
        '  - aslan@example.com (password: 123)',
        '  - alyssa@example.com (password: 123)',
        '  - ava@example.com (password: 123)',
        'Then login at http://localhost:3000/login as landlord@example.co.uk',
      ],
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: 'Failed to seed data', details: String(error) },
      { status: 500 }
    )
  }
}
