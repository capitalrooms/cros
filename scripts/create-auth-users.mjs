#!/usr/bin/env node

const testUsers = [
  {
    email: 'contractor+test@capitalrooms.co.uk',
    password: 'TestContractor123!',
    role: 'contractor'
  },
  {
    email: 'landlord+test@capitalrooms.co.uk',
    password: 'TestLandlord123!',
    role: 'landlord'
  },
  {
    email: 'lettings+test@capitalrooms.co.uk',
    password: 'TestLettings123!',
    role: 'lettings'
  }
];

const supabaseUrl = 'https://fihjzzxxhprxgjuefgtb.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaGp6enh4aHByeGdqdWVmZ3RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTg3MDA0MywiZXhwIjoyMTAxNDQ2MTQzfQ.WUxU1VWaQc4jpVuOJb7GLqe2ZN4v5C4HIm0HDYZev0k';

async function createAuthUsers() {
  console.log('🔐 Creating Supabase Auth users...\n');

  for (const user of testUsers) {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
        },
        body: JSON.stringify({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: {
            role: user.role,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.message?.includes('already exists')) {
          console.log(`⏭️  ${user.email} already exists in auth`);
        } else {
          console.error(`❌ ${user.email}:`, data.message || response.statusText);
        }
      } else {
        console.log(`✅ Created auth user: ${user.email}`);
      }
    } catch (err) {
      console.error(`❌ Error for ${user.email}:`, err.message);
    }
  }

  console.log('\n✅ Auth users setup complete!');
  console.log('\nTest credentials:');
  testUsers.forEach(u => {
    console.log(`  ${u.email} / ${u.password}`);
  });
}

createAuthUsers().catch(console.error);
