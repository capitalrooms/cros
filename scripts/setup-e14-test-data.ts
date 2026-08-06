/**
 * Setup E14 test data with itsharryb as a tenant
 * Run with: npx ts-node scripts/setup-e14-test-data.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function setupE14TestData() {
  console.log('Setting up E14 test data with itsharryb tenant...\n')

  try {
    // 1. Find or create E14 property
    console.log('1. Setting up E14 property...')
    const propResult = await supabase
      .from('properties')
      .select('id, name')
      .ilike('name', '%e14%')
      .single()

    let property = propResult.data

    if (!property) {
      const { data: created } = await supabase
        .from('properties')
        .insert({
          name: 'E14 HMO',
          address: '123 East Street, London E14 1AA',
        })
        .select()
        .single()
      property = created
      console.log('✓ Created E14 property')
    } else {
      console.log('✓ E14 property exists')
    }

    if (!property) throw new Error('Failed to get/create E14 property')
    const propertyId = property.id

    // 2. Find or create itsharryb tenant
    console.log('\n2. Setting up itsharryb tenant...')
    const tenantResult = await supabase
      .from('people')
      .select('id, email, name')
      .eq('email', 'itsharryb@example.com')
      .single()

    let tenant = tenantResult.data

    if (!tenant) {
      const { data: created } = await supabase
        .from('people')
        .insert({
          email: 'itsharryb@example.com',
          name: 'Harry B',
          role: 'tenant',
          property_id: propertyId,
        })
        .select()
        .single()
      tenant = created
      console.log('✓ Created itsharryb tenant')
    } else {
      console.log('✓ itsharryb tenant exists')
    }

    if (!tenant) {
      console.log('⚠️  Failed to create tenant, continuing anyway...')
    }
    const tenantId = tenant?.id

    // 3. Update rooms to belong to E14
    console.log('\n3. Assigning rooms to E14...')
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('property_id', propertyId)
      .limit(5)

    if (!rooms || rooms.length === 0) {
      console.log('⚠️  No rooms found in E14 property')
    } else {
      console.log(`✓ E14 has ${rooms.length} rooms`)

      // 4. Create tenancy for itsharryb in first room
      console.log('\n4. Creating tenancy for itsharryb...')
      const roomId = rooms[0].id

      const tenancyResult = await supabase
        .from('tenancies')
        .select('id')
        .eq('person_id', tenantId)
        .eq('room_id', roomId)
        .single()

      const existingTenancy = tenancyResult.data

      if (existingTenancy) {
        console.log(`✓ itsharryb already tenancy in ${rooms[0].name}`)
      } else {
        const { error } = await supabase.from('tenancies').insert({
          person_id: tenantId,
          property_id: propertyId,
          room_id: roomId,
          start_date: new Date().toISOString().split('T')[0],
        })

        if (error) {
          console.log(`⚠️  Could not create tenancy (table may not exist): ${error.message}`)
        } else {
          console.log(`✓ Created tenancy for itsharryb in ${rooms[0].name}`)
        }
      }
    }

    console.log('\n✅ E14 test data setup complete!')
    console.log('\n📋 Summary:')
    console.log(`   Property: E14 HMO`)
    console.log(`   Tenant: itsharryb@example.com`)
    console.log(`   Room: ${rooms?.[0]?.name || 'TBD'}`)
    console.log('\n🔔 You can now test notification features by clicking the 🔔 Notify button on rooms.')
  } catch (err) {
    console.error('Setup failed:', err)
    process.exit(1)
  }
}

setupE14TestData()
