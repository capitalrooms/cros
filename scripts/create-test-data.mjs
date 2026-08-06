#!/usr/bin/env node
/**
 * Create test data for E14 property with tenants
 * Run with: node scripts/create-test-data.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function createTestData() {
  console.log('📝 Creating test data for E14 property...\n')

  try {
    // 1. Find E14 property
    console.log('1️⃣  Finding E14 HMO property...')
    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('name', 'E14 HMO')
      .single()

    if (!property?.id) {
      console.error('   ❌ Could not find E14 HMO property')
      return
    }

    console.log(`   ✅ Found E14 HMO (ID: ${property.id})`)

    // 2. Create test rooms
    console.log('\n2️⃣  Creating test rooms...')
    const roomNames = [
      { name: 'Room 1 - Double', rent: 850 },
      { name: 'Room 2 - Double', rent: 800 },
      { name: 'Room 3 - Single', rent: 650 },
      { name: 'Room 4 - Studio', rent: 550 },
    ]

    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .insert(
        roomNames.map((r) => ({
          property_id: property.id,
          name: r.name,
          status: 'available',
          current_asking_rent: r.rent,
          previous_rent: r.rent - 50,
          days_on_market: 14,
          marketing_status: 'listed',
          is_priority: false,
        }))
      )
      .select()

    if (roomsError) {
      console.error('   ❌ Error creating rooms:', roomsError.message)
      return
    }

    console.log(`   ✅ Created ${rooms?.length || 0} rooms`)

    if (!rooms || rooms.length < 2) {
      console.error('   ❌ Could not create enough rooms')
      return
    }

    // 3. Create test person
    console.log('\n3️⃣  Creating test tenant...')
    const testEmail = 'rinseharry@gmail.com'
    const testName = 'Harry Rinse'

    let { data: person } = await supabase
      .from('people')
      .select('*')
      .eq('email', testEmail)
      .single()

    if (!person) {
      console.log(`   Creating: ${testName} <${testEmail}>`)
      const { data: created, error } = await supabase
        .from('people')
        .insert({ email: testEmail, name: testName, role: 'tenant' })
        .select()
        .single()

      if (error) {
        console.error('   ❌ Error creating person:', error.message)
        return
      }
      person = created
      console.log('   ✅ Person created')
    } else {
      console.log(`   ✅ Person exists: ${person.name}`)
    }

    // 4. Create tenancy for first room
    console.log('\n4️⃣  Creating tenancy...')
    const startDate = new Date().toISOString().split('T')[0]

    const { data: tenancy, error: tenancyError } = await supabase
      .from('tenancies')
      .insert({
        person_id: person.id,
        room_id: rooms[0].id,
        start_date: startDate,
        rent: rooms[0].current_asking_rent,
      })
      .select()

    if (tenancyError) {
      console.error('   ❌ Error creating tenancy:', tenancyError.message)
      return
    }

    console.log(`   ✅ Tenancy created: ${person.name} in ${rooms[0].name}`)

    // 5. Create second tenant
    console.log('\n5️⃣  Creating second tenant...')
    const testEmail2 = 'flatmate@capitalrooms.co.uk'
    const testName2 = 'Test Flatmate'

    let { data: person2 } = await supabase
      .from('people')
      .select('*')
      .eq('email', testEmail2)
      .single()

    if (!person2) {
      const { data: created, error } = await supabase
        .from('people')
        .insert({ email: testEmail2, name: testName2, role: 'tenant' })
        .select()
        .single()

      if (error) {
        console.error('   ❌ Error creating person:', error.message)
        return
      }
      person2 = created
      console.log('   ✅ Person created')
    } else {
      console.log(`   ✅ Person exists: ${person2.name}`)
    }

    // Create tenancy for second room
    const { data: tenancy2, error: tenancyError2 } = await supabase
      .from('tenancies')
      .insert({
        person_id: person2.id,
        room_id: rooms[1].id,
        start_date: startDate,
        rent: rooms[1].current_asking_rent,
      })
      .select()

    if (tenancyError2) {
      console.error('   ❌ Error creating tenancy:', tenancyError2.message)
      return
    }

    console.log(`   ✅ Tenancy created: ${person2.name} in ${rooms[1].name}`)

    // Summary
    console.log('\n✅ Test Data Setup Complete!\n')
    console.log('📍 Property: E14 HMO')
    console.log('📍 Address: 123 East Street, London E14 1AA')
    console.log('\n👥 Tenants:')
    console.log(`   1. ${testName} in ${rooms[0].name}`)
    console.log(`      Email: ${testEmail}`)
    console.log(`   2. ${testName2} in ${rooms[1].name}`)
    console.log(`      Email: ${testEmail2}`)
    console.log('\n🎯 The page should now display the E14 property with rooms and tenant info!')
  } catch (err) {
    console.error('❌ Setup failed:', err instanceof Error ? err.message : err)
  }
}

createTestData()
