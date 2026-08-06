/**
 * Setup Auth User Script
 * Creates a Supabase Auth user for lettings
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  console.error('Need: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function setupAuthUser() {
  console.log('Setting up Supabase Auth user...\n');

  try {
    // Create auth user
    const { data, error } = await supabase.auth.admin.createUser({
      email: 'lettings@capitalrooms.co.uk',
      password: 'Lettings123!@#',
      email_confirm: true,
    });

    if (error) {
      if (error.message.includes('already exists')) {
        console.log('✓ Auth user already exists');
      } else {
        console.error('Error creating auth user:', error);
        throw error;
      }
    } else {
      console.log('✓ Auth user created:', data.user?.email);
    }

    console.log('\n✨ Auth setup complete!');
    console.log('\n🔗 Login Credentials:');
    console.log('   Email:    lettings@capitalrooms.co.uk');
    console.log('   Password: Lettings123!@#');
    console.log('\n📊 Dashboard: http://localhost:3000/lettings');
  } catch (err) {
    console.error('Setup failed:', err);
    process.exit(1);
  }
}

setupAuthUser();
