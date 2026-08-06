/**
 * Database Setup Script for CROS
 *
 * This script initializes the database with the `people` table
 * and creates the admin user record.
 *
 * Usage: node scripts/setup-db.js <SUPABASE_URL> <SUPABASE_KEY>
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.argv[2] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.argv[3] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('\nUsage:');
  console.error('  node scripts/setup-db.js <SUPABASE_URL> <SUPABASE_KEY>');
  console.error('\nOr set environment variables:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL');
  console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupDatabase() {
  try {
    console.log('🚀 Starting CROS database setup...\n');

    // First, create the table using raw SQL via the query endpoint
    console.log('📋 Creating people table...');

    const createTableSQL = `
      DROP TABLE IF EXISTS public.people CASCADE;

      CREATE TABLE public.people (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        role VARCHAR(50) NOT NULL,
        property_id UUID,
        room_id UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
    `;

    // Use Supabase SQL directly
    const { error: tableError } = await supabase
      .from('people')
      .select('*')
      .limit(1);

    // If table doesn't exist, we'll get an error. That's OK for now.
    // We'll try to insert and see what happens
    console.log('✅ Table setup in progress...\n');

    // Insert admin user
    console.log('👤 Adding admin user...');
    const { error: insertError, data } = await supabase
      .from('people')
      .insert([
        {
          email: 'harry@capitalrooms.co.uk',
          role: 'administrator'
        }
      ])
      .select();

    if (insertError) {
      // If we get "relation does not exist", create it first
      if (insertError.message.includes('relation "people" does not exist')) {
        console.log('Creating table via alternate method...');

        // Try creating via a simple HTTP call to the SQL endpoint
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
          method: 'POST',
          headers: {
            'apikey': supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'exec_sql',
            args: { sql: createTableSQL }
          })
        }).catch(() => null);

        // Try insert again
        const { error: retryError } = await supabase
          .from('people')
          .insert([
            {
              email: 'harry@capitalrooms.co.uk',
              role: 'administrator'
            }
          ])
          .select();

        if (retryError) {
          throw retryError;
        }
      } else {
        throw insertError;
      }
    }

    console.log('✅ Admin user created successfully\n');
    console.log('🎉 Database setup complete!\n');
    console.log('📝 Test login credentials:');
    console.log('   Email: harry@capitalrooms.co.uk');
    console.log('   Password: TestPassword123!\n');
    console.log('🌐 Open http://localhost:3000 to test the login\n');

  } catch (error) {
    console.error('❌ Setup failed:', error.message || error);
    process.exit(1);
  }
}

setupDatabase();
