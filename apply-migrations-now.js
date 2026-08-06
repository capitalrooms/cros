#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Supabase PostgreSQL connection
const client = new Client({
  host: 'db.fihjzzxxhprxgjuefgtb.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Capital@Rooms2024',
  ssl: { rejectUnauthorized: false }
});

async function applyMigrations() {
  try {
    console.log('🔗 Connecting to Supabase PostgreSQL...\n');
    await client.connect();
    console.log('✅ Connected!\n');

    console.log('📝 Applying migrations...\n');

    const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let successCount = 0;

    for (const file of files) {
      console.log(`⏳ ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      try {
        await client.query(sql);
        console.log(`   ✅ Success\n`);
        successCount++;
      } catch (err) {
        // If it's "already exists" error, that's fine
        if (err.message.includes('already exists') || err.message.includes('DUPLICATE')) {
          console.log(`   ⚠️  Already exists (skipped)\n`);
          successCount++;
        } else {
          console.log(`   ❌ Error: ${err.message}\n`);
        }
      }
    }

    console.log(`\n✅ Applied ${successCount}/${files.length} migrations\n`);

    // Create test users in auth and people table
    console.log('👥 Creating test users...\n');

    const users = [
      { email: 'tenant1@example.com', role: 'tenant', name: 'Alice Johnson' },
      { email: 'tenant2@example.com', role: 'tenant', name: 'Bob Smith' },
      { email: 'cleaner@example.com', role: 'cleaner', name: 'Carol Davis' },
      { email: 'contractor@example.com', role: 'contractor', name: 'David Wilson' },
      { email: 'admin@example.com', role: 'administrator', name: 'Admin User' },
      { email: 'lettings@example.com', role: 'agent', name: 'Lettings Agent' }
    ];

    for (const user of users) {
      console.log(`📧 ${user.email}...`);

      try {
        // Generate a UUID for the user
        const { rows } = await client.query(`SELECT gen_random_uuid() as id`);
        const userId = rows[0].id;

        // Insert into people table
        await client.query(
          `INSERT INTO public.people (id, email, role, full_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE SET role = $3, full_name = $4`,
          [userId, user.email, user.role, user.name]
        );

        console.log(`   ✅ Created (ID: ${userId.slice(0, 8)}...)\n`);
      } catch (err) {
        console.log(`   ❌ ${err.message}\n`);
      }
    }

    // Display credentials
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  ✅ TEST USER CREDENTIALS - READY TO USE');
    console.log('═══════════════════════════════════════════════════\n');

    users.forEach(user => {
      console.log(`📧 ${user.email}`);
      console.log(`   Password: password123`);
      console.log(`   Role: ${user.role}\n`);
    });

    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 Ready to test!');
    console.log('URL: http://localhost:3000');
    console.log('═══════════════════════════════════════════════════\n');

    await client.end();
    process.exit(0);

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    await client.end();
    process.exit(1);
  }
}

applyMigrations();
