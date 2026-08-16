#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fihjzzxxhprxgjuefgtb.supabase.co';
const anonKey = 'sb_publishable_apKuf2BqWZ-dGNXiyoWhlQ_T2nttJ73';

const supabase = createClient(supabaseUrl, anonKey);

const testUsers = [
  {
    email: 'contractor+test@capitalrooms.co.uk',
    role: 'contractor',
    fullName: 'Test Contractor'
  },
  {
    email: 'landlord+test@capitalrooms.co.uk',
    role: 'landlord',
    fullName: 'Test Landlord'
  },
  {
    email: 'lettings+test@capitalrooms.co.uk',
    role: 'lettings',
    fullName: 'Test Lettings Manager'
  }
];

async function createUsers() {
  console.log('🔧 Creating test users in people table...\n');

  for (const user of testUsers) {
    try {
      const { data, error } = await supabase
        .from('people')
        .insert({
          email: user.email,
          role: user.role,
          full_name: user.fullName,
        })
        .select();

      if (error) {
        console.error(`❌ ${user.email}:`, error.message);
      } else {
        console.log(`✅ Created: ${user.email} (${user.role})`);
      }
    } catch (err) {
      console.error(`❌ Error:`, err.message);
    }
  }

  console.log('\n📋 Verifying test users...\n');
  const { data: allUsers, error } = await supabase
    .from('people')
    .select('email, role')
    .like('email', '%+test@%')
    .order('email');

  if (error) {
    console.error('❌ Error verifying:', error.message);
  } else if (allUsers) {
    console.log('✅ Test users in database:');
    allUsers.forEach(u => console.log(`   - ${u.email} (${u.role})`));
  }
}

createUsers().catch(console.error);
