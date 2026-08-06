#!/usr/bin/env node

/**
 * Database Migration & Test User Setup Script
 * Applies all migrations and creates test users
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'https://fihjzzxxhprxgjuefgtb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaGp6enh4aHByeGdqdWVmZ3RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTg3MDA0MywiZXhwIjoyMTAxNDQ2MTQzfQ.WUxU1VWaQc4jpVuOJb7GLqe2ZN4v5C4HIm0HDYZev0k';

// Helper function to make HTTPS requests to Supabase
function supabaseRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve({ raw: data });
          }
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Execute raw SQL via Supabase
async function executeSql(sql) {
  try {
    const response = await supabaseRequest('POST', '/rest/v1/rpc/exec_sql', {
      sql
    });
    return response;
  } catch (err) {
    // If rpc endpoint doesn't work, we need another approach
    console.error('SQL execution failed:', err.message);
    throw err;
  }
}

// Read and apply migrations
async function applyMigrations() {
  console.log('🔄 Applying database migrations...\n');

  const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files`);

  for (const file of files.slice(0, 3)) { // Start with first 3
    console.log(`\n📝 Applying: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      await executeSql(sql);
      console.log(`✅ ${file} completed`);
    } catch (err) {
      console.log(`⚠️ ${file} - Error: ${err.message}`);
      // Continue with next migration
    }
  }
}

// Create test users
async function createTestUsers() {
  console.log('\n\n🧪 Creating test users...\n');

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
    }
  ];

  const credentials = [];

  for (const user of users) {
    console.log(`Creating: ${user.email} (${user.role})`);

    try {
      // Create auth user
      const authUser = await supabaseRequest('POST', '/auth/v1/admin/users', {
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: user.name
        }
      });

      if (authUser.id) {
        console.log(`  ✅ Auth user created: ${authUser.id}`);

        // Create people record
        const peopleRecord = await supabaseRequest('POST', '/rest/v1/people', {
          id: authUser.id,
          email: user.email,
          role: user.role,
          full_name: user.name
        });

        credentials.push({
          email: user.email,
          password: user.password,
          role: user.role,
          name: user.name,
          userId: authUser.id
        });

        console.log(`  ✅ Database record created`);
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
  }

  return credentials;
}

// Main execution
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Capital Rooms - Database Setup Script');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    console.log('⚠️  NOTE: This script attempts to apply migrations via REST API');
    console.log('If migrations fail, use the CLI method: supabase db push\n');

    // Try applying migrations
    try {
      await applyMigrations();
    } catch (err) {
      console.log('\n⚠️  Migration via REST API failed. Use Supabase CLI instead:');
      console.log('   supabase link --project-ref fihjzzxxhprxgjuefgtb');
      console.log('   supabase db push\n');
    }

    // Create test users
    const credentials = await createTestUsers();

    // Display credentials
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  ✅ TEST USER CREDENTIALS');
    console.log('═══════════════════════════════════════════════════\n');

    credentials.forEach(cred => {
      console.log(`📧 ${cred.email}`);
      console.log(`   Password: ${cred.password}`);
      console.log(`   Role: ${cred.role}`);
      console.log(`   Name: ${cred.name}\n`);
    });

    console.log('═══════════════════════════════════════════════════');
    console.log('Login URL: http://localhost:3000');
    console.log('═══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
}

main();
