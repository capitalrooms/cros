/**
 * Check database schema
 * Run with: npx ts-node scripts/check-schema.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkSchema() {
  console.log('🔍 Checking database schema...\n')

  // Get one room to see all its columns
  const { data: room, error } = await supabase.from('rooms').select('*').limit(1).single()

  if (error) {
    console.error('Error fetching room:', error)
  } else if (room) {
    console.log('Room columns:')
    Object.keys(room).forEach((key) => {
      console.log(`  - ${key}: ${typeof room[key]}`)
    })
  }

  // Check if viewings table exists
  console.log('\n📋 Checking for viewings table...')
  const { data: viewings, error: viewingsError } = await supabase.from('viewings').select('*').limit(1)

  if (viewingsError?.code === 'PGRST205') {
    console.log('❌ Viewings table does NOT exist')
    console.log('   This means migration 009 has not been applied')
  } else if (viewingsError) {
    console.log('⚠️  Error checking viewings table:', viewingsError)
  } else {
    console.log('✅ Viewings table EXISTS')
    if (viewings && viewings.length > 0) {
      console.log('Viewing columns:')
      Object.keys(viewings[0]).forEach((key) => {
        console.log(`  - ${key}: ${typeof viewings[0][key]}`)
      })
    }
  }
}

checkSchema()
