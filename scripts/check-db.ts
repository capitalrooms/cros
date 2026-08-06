/**
 * Debug script to check database contents
 * Run with: npx ts-node scripts/check-db.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkDatabase() {
  console.log('🔍 Checking database contents...\n')

  // Check properties
  console.log('📍 Properties:')
  const { data: properties, error: propsError } = await supabase
    .from('properties')
    .select('*')
  if (propsError) console.error('Error:', propsError)
  else console.log(`Found ${properties?.length || 0} properties:`)
  properties?.forEach((p) => console.log(`  - ${p.name} (${p.address})`))

  // Check rooms
  console.log('\n🛏️  Rooms:')
  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*, properties(name)')
  if (roomsError) console.error('Error:', roomsError)
  else console.log(`Found ${rooms?.length || 0} rooms:`)
  rooms?.forEach((r) => {
    const prop = (r as any).properties?.name || 'No property'
    console.log(`  - ${r.name} in ${prop}`)
  })

  // Check people with lettings role
  console.log('\n👤 Users with lettings role:')
  const { data: lettingsUsers, error: usersError } = await supabase
    .from('people')
    .select('*')
    .eq('role', 'lettings')
  if (usersError) console.error('Error:', usersError)
  else console.log(`Found ${lettingsUsers?.length || 0} lettings users:`)
  lettingsUsers?.forEach((u) => console.log(`  - ${u.email}`))

  // Check all people
  console.log('\n👥 All people:')
  const { data: allPeople, error: allError } = await supabase
    .from('people')
    .select('*')
  if (allError) console.error('Error:', allError)
  else {
    console.log(`Found ${allPeople?.length || 0} people total:`)
    allPeople?.forEach((p) => console.log(`  - ${p.email} (${p.role})`))
  }

  // Check viewings
  console.log('\n📅 Viewings:')
  const { data: viewings, error: viewingsError } = await supabase
    .from('viewings')
    .select('*')
  if (viewingsError) console.error('Error:', viewingsError)
  else console.log(`Found ${viewings?.length || 0} viewings`)
}

checkDatabase()
