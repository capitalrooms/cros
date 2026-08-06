/**
 * Setup E14 property with test rooms and data
 * Run after migration: npx ts-node scripts/setup-e14-test-rooms.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

async function setupE14() {
  console.log('🏢 Setting up E14 test property...\n')

  try {
    // 1. Find or create E14 property
    console.log('1️⃣  Finding E14 property...')
    const { data: existingProp } = await supabase
      .from('properties')
      .select('*')
      .ilike('name', '%e14%')
      .single()
    let property = existingProp

    if (!property) {
      console.log('   Creating E14 HMO property...')
      const { data: created } = await supabase
        .from('properties')
        .insert({
          name: 'E14 HMO',
          address: '123 East Street, London E14 1AA',
        })
        .select()
        .single()
      property = created
      console.log('   ✅ Created E14 HMO')
    } else {
      console.log(`   ✅ Found: ${property.name} at ${property.address}`)
    }

    if (!property?.id) {
      console.error('   ❌ Could not find/create property')
      return
    }

    // 2. Get existing rooms or create test rooms
    console.log('\n2️⃣  Setting up rooms...')
    const { data: existingRooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('property_id', property.id)

    console.log(`   Found ${existingRooms?.length || 0} existing rooms in E14`)

    if (!existingRooms || existingRooms.length === 0) {
      console.log('   Creating 4 test rooms...')
      const roomNames = ['Room 1 (Double)', 'Room 2 (Double)', 'Room 3 (Single)', 'Room 4 (Studio)']
      const roomData = roomNames.map((name) => ({
        property_id: property.id,
        name,
        description: `${name} in E14 HMO`,
      }))

      const { data: created, error } = await supabase.from('rooms').insert(roomData).select()

      if (error) {
        console.error('   ❌ Error creating rooms:', error.message)
        return
      }

      console.log(`   ✅ Created ${created?.length || 0} rooms`)

      // Update rooms with lettings data
      const roomsToUpdate = created?.map((room, idx) => ({
        id: room.id,
        status: idx === 0 ? 'occupied' : idx === 1 ? 'available' : 'on_notice',
        current_asking_rent: [850, 800, 650, 550][idx] || 750,
        previous_rent: [800, 750, 600, 500][idx] || 700,
        days_on_market: [0, 14, 21, 45][idx] || 0,
        marketing_status: idx === 0 ? 'not_listed' : idx === 1 ? 'listed' : 'listed',
        is_priority: idx === 2, // Room 3 is priority
        available_date:
          idx === 1
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            : idx === 2
              ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
              : null,
      }))

      if (roomsToUpdate && roomsToUpdate.length > 0) {
        for (const room of roomsToUpdate) {
          await supabase.from('rooms').update(room).eq('id', room.id)
        }
        console.log('   ✅ Updated rooms with lettings data')
      }
    } else {
      console.log('   ✅ Using existing rooms')

      // Update existing rooms with lettings data if not set
      const { data: roomsToUpdate } = await supabase
        .from('rooms')
        .select('*')
        .eq('property_id', property.id)
        .is('status', null)

      if (roomsToUpdate && roomsToUpdate.length > 0) {
        console.log(`   Updating ${roomsToUpdate.length} rooms with test data...`)
        for (let i = 0; i < roomsToUpdate.length; i++) {
          await supabase
            .from('rooms')
            .update({
              status: i === 0 ? 'occupied' : i === 1 ? 'available' : 'on_notice',
              current_asking_rent: 800,
              previous_rent: 750,
              days_on_market: Math.floor(Math.random() * 30),
              marketing_status: i === 0 ? 'not_listed' : 'listed',
              is_priority: i === 2,
              available_date:
                i === 1
                  ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                  : null,
            })
            .eq('id', roomsToUpdate[i].id)
        }
        console.log('   ✅ Updated with test data')
      }
    }

    // 3. Summary
    console.log('\n✅ E14 Property Setup Complete!\n')
    console.log('📍 Property: E14 HMO')
    console.log('📍 Address: 123 East Street, London E14 1AA')
    console.log('📊 Rooms:')

    const { data: finalRooms } = await supabase
      .from('rooms')
      .select('name, status, current_asking_rent')
      .eq('property_id', property.id)

    finalRooms?.forEach((r) => {
      console.log(
        `   • ${r.name} - ${r.status} (£${r.current_asking_rent}/week)`
      )
    })

    console.log('\n🎯 Next steps:')
    console.log('   1. Create a lettings test account (lettings@capitalrooms.co.uk)')
    console.log('   2. Sign in at http://localhost:3000')
    console.log('   3. Go to /lettings and you should see E14 property with rooms!\n')
  } catch (err) {
    console.error('❌ Setup failed:', err instanceof Error ? err.message : err)
  }
}

setupE14()
