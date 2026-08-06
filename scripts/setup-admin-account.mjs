#!/usr/bin/env node
/**
 * Setup admin account for Capital Rooms
 * Run with: node scripts/setup-admin-account.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'harry@capitalrooms.co.uk'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function setupAdmin() {
  console.log('🔐 Setting up admin account...\n')
  console.log(`Admin email: ${adminEmail}`)

  try {
    // Check if admin person record exists
    let { data: admin } = await supabase
      .from('people')
      .select('*')
      .eq('email', adminEmail)
      .single()

    if (!admin) {
      console.log('Creating admin person record...')
      const { data: created, error } = await supabase
        .from('people')
        .insert({ email: adminEmail, role: 'administrator', full_name: 'Admin' })
        .select()
        .single()

      if (error) {
        console.error('Error creating admin:', error.message)
        return
      }

      admin = created
      console.log('✅ Admin person record created')
    } else if (admin.role !== 'administrator') {
      console.log('Updating admin role...')
      const { error } = await supabase
        .from('people')
        .update({ role: 'administrator' })
        .eq('id', admin.id)

      if (error) {
        console.error('Error updating admin:', error.message)
        return
      }

      console.log('✅ Admin role updated')
    } else {
      console.log('✅ Admin account already exists')
    }

    console.log('\n📝 To sign in as admin:\n')
    console.log(`Email:    ${adminEmail}`)
    console.log(`Password: (use your Supabase password, or set one via "Forgot password")\n`)
    console.log('Then go to: http://localhost:3000/admin/properties\n')
  } catch (err) {
    console.error('❌ Setup failed:', err instanceof Error ? err.message : err)
  }
}

setupAdmin()
