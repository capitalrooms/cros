#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const testUsers = [
  {
    email: 'contractor+test@capitalrooms.co.uk',
    password: 'TestContractor123!',
    role: 'contractor',
    fullName: 'Test Contractor'
  },
  {
    email: 'landlord+test@capitalrooms.co.uk',
    password: 'TestLandlord123!',
    role: 'landlord',
    fullName: 'Test Landlord'
  },
  {
    email: 'lettings+test@capitalrooms.co.uk',
    password: 'TestLettings123!',
    role: 'lettings',
    fullName: 'Test Lettings Manager'
  }
];

async function createTestUsers() {
  console.log('🔧 Creating test users...\n');

  for (const user of testUsers) {
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          console.log(`⏭️  ${user.email} already exists in auth`);
        } else {
          console.error(`❌ Error creating auth for ${user.email}:`, authError.message);
          continue;
        }
      } else {
        console.log(`✅ Created auth user: ${user.email}`);
      }

      // Insert into people table
      const { data: personData, error: personError } = await supabase
        .from('people')
        .insert({
          email: user.email,
          role: user.role,
          full_name: user.fullName,
        })
        .select();

      if (personError) {
        if (personError.message.includes('duplicate')) {
          console.log(`⏭️  ${user.email} already exists in people table`);
        } else {
          console.error(`❌ Error creating person for ${user.email}:`, personError.message);
        }
      } else {
        console.log(`✅ Created person record: ${user.email} (${user.role})`);
      }
    } catch (err) {
      console.error(`❌ Error processing ${user.email}:`, err);
    }
  }

  // Verify all users
  console.log('\n📋 Verifying test users...\n');
  const { data: allUsers } = await supabase
    .from('people')
    .select('email, role')
    .like('email', '%+test@%')
    .order('email');

  if (allUsers) {
    console.log('✅ Test users in database:');
    allUsers.forEach(u => console.log(`   - ${u.email} (${u.role})`));
  }
}

createTestUsers().catch(console.error);
