/**
 * Create a test lettings account
 * Run with: npx ts-node scripts/create-test-account.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

async function createTestAccount() {
  const email = 'lettings@capitalrooms.co.uk'
  const password = 'Test1234!'

  console.log('🔐 Creating test lettings account...\n')
  console.log(`Email: ${email}`)
  console.log(`Password: ${password}\n`)

  try {
    console.log('Attempting to create auth user...')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/lettings`,
      },
    })

    if (error) {
      if (error.message.includes('already registered')) {
        console.log('✅ User already exists')
      } else {
        console.error('❌ Error creating user:', error.message)
        return
      }
    } else {
      console.log('✅ Auth user created')
    }

    // Verify person record exists
    const { data: person } = await supabase
      .from('people')
      .select('*')
      .eq('email', email)
      .single()

    if (person) {
      console.log('✅ Person record exists with role:', person.role)
    } else {
      console.log('⚠️  Creating person record...')
      await supabase.from('people').insert({ email, role: 'lettings' })
      console.log('✅ Person record created')
    }

    console.log('\n✅ Test account ready!\n')
    console.log('🔓 Sign in with:')
    console.log(`   Email:    ${email}`)
    console.log(`   Password: ${password}\n`)
    console.log('Visit: http://localhost:3000/lettings')
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err)
  }
}

createTestAccount()
