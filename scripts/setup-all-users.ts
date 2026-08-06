/**
 * Setup All Test Users for CROS
 * Creates auth users and people records for all roles
 *
 * IMPORTANT: You need the SUPABASE_SERVICE_ROLE_KEY to run this script
 *
 * To get the key:
 * 1. Go to https://supabase.com/dashboard
 * 2. Select the Capital Rooms project (fihjzzxxhprxgjuefgtb)
 * 3. Go to Project Settings → API
 * 4. Copy the "Service Role Secret Key" (starts with "sbp_")
 * 5. Run: SUPABASE_SERVICE_ROLE_KEY=<key> npx ts-node scripts/setup-all-users.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nTo get the key:');
  console.error('1. Go to https://supabase.com/dashboard');
  console.error('2. Select the Capital Rooms project');
  console.error('3. Go to Project Settings → API');
  console.error('4. Copy the "Service Role Secret Key"');
  console.error('5. Run: SUPABASE_SERVICE_ROLE_KEY=<key> npx ts-node scripts/setup-all-users.ts\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

interface UserConfig {
  email: string;
  password: string;
  role: 'administrator' | 'lettings' | 'contractor' | 'cleaner' | 'tenant' | 'landlord';
}

const users: UserConfig[] = [
  {
    email: 'harry@capitalrooms.co.uk',
    password: 'Test1234!',
    role: 'administrator',
  },
  {
    email: 'lettings@capitalrooms.co.uk',
    password: 'Test1234!',
    role: 'lettings',
  },
  {
    email: 'contractor@example.com',
    password: 'Test1234!',
    role: 'contractor',
  },
  {
    email: 'cleaner@example.com',
    password: 'Test1234!',
    role: 'cleaner',
  },
  {
    email: 'john@example.com',
    password: 'Test1234!',
    role: 'tenant',
  },
  {
    email: 'itsharryb@protonmail.com',
    password: 'Test1234!',
    role: 'tenant',
  },
  {
    email: 'rinseharry@gmail.com',
    password: 'Test1234!',
    role: 'landlord',
  },
];

async function setupAllUsers() {
  console.log('🚀 Setting up all test users...\n');

  let successCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    try {
      console.log(`📧 Setting up ${user.email} (${user.role})...`);

      // Create auth user
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      });

      if (error) {
        if (error.message.includes('already exists')) {
          console.log('   ⚠️  Auth user already exists');
        } else {
          console.error('   ❌ Error creating auth user:', error.message);
          continue;
        }
      } else {
        console.log('   ✅ Auth user created');
      }

      // Create/update people record
      const { data: existing } = await supabase
        .from('people')
        .select('id')
        .eq('email', user.email)
        .single();

      if (existing) {
        const { error: updateError } = await supabase
          .from('people')
          .update({ role: user.role })
          .eq('email', user.email);

        if (updateError) {
          console.error('   ❌ Error updating people record:', updateError.message);
        } else {
          console.log('   ✅ People record updated');
        }
      } else {
        const { error: insertError } = await supabase
          .from('people')
          .insert({
            email: user.email,
            role: user.role,
          });

        if (insertError) {
          console.error('   ❌ Error creating people record:', insertError.message);
        } else {
          console.log('   ✅ People record created');
        }
      }

      successCount++;
      console.log();
    } catch (err) {
      console.error(`   ❌ Unexpected error:`, err instanceof Error ? err.message : err);
      console.log();
    }
  }

  console.log('\n✨ Setup Complete!\n');
  console.log(`✅ ${successCount} users configured`);
  console.log(`ℹ️  ${users.length - successCount} had issues\n`);

  console.log('🔓 Test Credentials:');
  console.log('   All emails use password: Test1234!\n');

  console.log('📊 Access URLs:');
  console.log('   Admin:      http://localhost:3000/admin');
  console.log('   Lettings:   http://localhost:3000/lettings');
  console.log('   Contractor: http://localhost:3000/contractor');
  console.log('   Cleaner:    http://localhost:3000/cleaner');
  console.log('   Tenant:     http://localhost:3000/tenant');
  console.log('   Landlord:   http://localhost:3000/landlord\n');
}

setupAllUsers().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
