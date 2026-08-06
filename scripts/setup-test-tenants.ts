/**
 * Setup test tenants for E14 property to test notifications
 * Run with: npx ts-node scripts/setup-test-tenants.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

async function setupTestTenants() {
  console.log('👥 Setting up test tenants for E14...\n')

  try {
    // 1. Find E14 property
    console.log('1️⃣  Finding E14 property...')
    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .ilike('name', '%e14%')
      .single()

    if (!property?.id) {
      console.error('   ❌ Could not find E14 property')
      console.log('   Run setup-e14-test-rooms.ts first\n')
      return
    }

    console.log(`   ✅ Found: ${property.name}`)

    // 2. Get existing rooms
    console.log('\n2️⃣  Finding rooms...')
    const { data: rooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('property_id', property.id)
      .limit(2)

    if (!rooms || rooms.length < 2) {
      console.error('   ❌ Need at least 2 rooms in E14')
      console.log('   Run setup-e14-test-rooms.ts first\n')
      return
    }

    console.log(`   ✅ Found ${rooms.length} rooms to use for testing`)

    // 3. Create/find test person
    console.log('\n3️⃣  Setting up test tenant...')
    const testEmail = 'rinseharry@gmail.com'
    const testName = 'Harry Rinse'

    let { data: person } = await supabase
      .from('people')
      .select('*')
      .eq('email', testEmail)
      .single()

    if (!person) {
      console.log(`   Creating person: ${testName} <${testEmail}>`)
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

    // 4. Create tenancy for room 1
    console.log('\n4️⃣  Creating tenancy...')
    const room1 = rooms[0]
    const startDate = new Date()
    const endDate = new Date()
    endDate.setFullYear(endDate.getFullYear() + 1)

    // Check if tenancy already exists
    let { data: existingTenancy } = await supabase
      .from('tenancies')
      .select('*')
      .eq('person_id', person.id)
      .eq('room_id', room1.id)
      .is('end_date', null)
      .single()

    if (!existingTenancy) {
      const { data: tenancy, error } = await supabase
        .from('tenancies')
        .insert({
          person_id: person.id,
          room_id: room1.id,
          start_date: startDate.toISOString().split('T')[0],
          end_date: null, // Active tenancy
          rent: 800,
        })
        .select()
        .single()

      if (error) {
        console.error('   ❌ Error creating tenancy:', error.message)
        return
      }

      console.log(`   ✅ Tenancy created: ${person.name} in ${room1.name}`)
    } else {
      console.log(`   ✅ Tenancy already exists: ${person.name} in ${room1.name}`)
    }

    // 5. Create another test tenant for a different room
    console.log('\n5️⃣  Creating second test tenant...')
    const testEmail2 = 'flatmate@capitalrooms.co.uk'
    const testName2 = 'Test Flatmate'

    let { data: person2 } = await supabase
      .from('people')
      .select('*')
      .eq('email', testEmail2)
      .single()

    if (!person2) {
      console.log(`   Creating person: ${testName2} <${testEmail2}>`)
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

    // Create tenancy for room 2
    const room2 = rooms[1]
    let { data: existingTenancy2 } = await supabase
      .from('tenancies')
      .select('*')
      .eq('person_id', person2.id)
      .eq('room_id', room2.id)
      .is('end_date', null)
      .single()

    if (!existingTenancy2) {
      const { data: tenancy, error } = await supabase
        .from('tenancies')
        .insert({
          person_id: person2.id,
          room_id: room2.id,
          start_date: startDate.toISOString().split('T')[0],
          end_date: null,
          rent: 850,
        })
        .select()
        .single()

      if (error) {
        console.error('   ❌ Error creating tenancy:', error.message)
        return
      }

      console.log(`   ✅ Tenancy created: ${person2.name} in ${room2.name}`)
    } else {
      console.log(`   ✅ Tenancy already exists: ${person2.name} in ${room2.name}`)
    }

    // 6. Summary
    console.log('\n✅ Test Tenants Setup Complete!\n')
    console.log('📍 Property: ' + property.name)
    console.log('📍 Address: ' + property.address)
    console.log('\n👥 Test Tenants:')
    console.log(`   1. ${testName} in ${room1.name}`)
    console.log(`      Email: ${testEmail}`)
    console.log(`   2. ${testName2} in ${room2.name}`)
    console.log(`      Email: ${testEmail2}`)
    console.log('\n🎯 You can now:')
    console.log('   1. Sign in as lettings@capitalrooms.co.uk')
    console.log('   2. Go to /lettings and see the E14 property with rooms & tenants')
    console.log('   3. Create a viewing for a room')
    console.log('   4. Test notifications to see if tenants receive messages\n')
  } catch (err) {
    console.error('❌ Setup failed:', err instanceof Error ? err.message : err)
  }
}

setupTestTenants()
