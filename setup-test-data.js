#!/usr/bin/env node

/**
 * Setup Test Data - Creates test users and properties for workflow testing
 * Run this after migrations are applied to the database
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fihjzzxxhprxgjuefgtb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaGp6enh4aHByeGdqdWVmZ3RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTg3MDA0MywiZXhwIjoyMTAxNDQ2MTQzfQ.WUxU1VWaQc4jpVuOJb7GLqe2ZN4v5C4HIm0HDYZev0k';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createTestData() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Capital Rooms - Test Data Setup');
  console.log('═══════════════════════════════════════════════════\n');

  const credentials = [];

  try {
    console.log('🧪 Creating test users...\n');

    // Test users to create
    const users = [
      {
        email: 'tenant1@example.com',
        password: 'password123',
        role: 'tenant',
        name: 'Alice Johnson'
      },
      {
        email: 'tenant2@example.com',
        password: 'password123',
        role: 'tenant',
        name: 'Bob Smith'
      },
      {
        email: 'cleaner@example.com',
        password: 'password123',
        role: 'cleaner',
        name: 'Carol Davis'
      },
      {
        email: 'contractor@example.com',
        password: 'password123',
        role: 'contractor',
        name: 'David Wilson'
      },
      {
        email: 'admin@example.com',
        password: 'password123',
        role: 'administrator',
        name: 'Admin User'
      },
      {
        email: 'lettings@example.com',
        password: 'password123',
        role: 'agent',
        name: 'Lettings Agent'
      }
    ];

    // Create each user
    for (const user of users) {
      console.log(`📝 Creating: ${user.email} (${user.role})`);

      try {
        // Create auth user via Supabase Admin API
        const { data, error } = await supabase.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: {
            full_name: user.name
          }
        });

        if (error) {
          console.log(`   ⚠️  Auth error: ${error.message}`);
          // User might already exist, continue
        } else if (data.user) {
          console.log(`   ✅ Auth user created: ${data.user.id}`);

          // Try to insert into people table
          const { error: insertError } = await supabase
            .from('people')
            .insert({
              id: data.user.id,
              email: user.email,
              role: user.role,
              full_name: user.name
            });

          if (insertError) {
            console.log(`   ⚠️  DB error: ${insertError.message}`);
          } else {
            console.log(`   ✅ Database record created`);
          }

          credentials.push({
            email: user.email,
            password: user.password,
            role: user.role,
            name: user.name,
            userId: data.user.id
          });
        }
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
      }
    }

    // Display credentials
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  ✅ TEST USER CREDENTIALS');
    console.log('═══════════════════════════════════════════════════\n');

    credentials.forEach(cred => {
      console.log(`📧 Email: ${cred.email}`);
      console.log(`   Password: ${cred.password}`);
      console.log(`   Role: ${cred.role}`);
      console.log(`   Name: ${cred.name}\n`);
    });

    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 Ready to test!');
    console.log('Login URL: http://localhost:3000');
    console.log('═══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n⚠️  Make sure:');
    console.log('1. Database migrations have been applied');
    console.log('2. People table exists in database');
    process.exit(1);
  }
}

createTestData();
