#!/usr/bin/env node

/**
 * Deploy security migrations to Supabase
 * Runs all 9 migrations (022-030) in order
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

// Extract project ID from URL
const projectId = SUPABASE_URL.split('//')[1].split('.')[0];
console.log(`📦 Supabase Project: ${projectId}`);
console.log(`🌐 URL: ${SUPABASE_URL}\n`);

// Migration files in order
const migrations = [
  '022_create_tenancies_table.sql',
  '023_fix_cleaner_table_schema.sql',
  '024_create_pending_cleaner_notes.sql',
  '025_create_compliance_logs.sql',
  '026_create_tenant_self_checks.sql',
  '027_create_tenant_acknowledgment_notes.sql',
  '028_auto_attach_pending_cleaner_notes.sql',
  '029_fix_rls_policies_critical.sql',
  '030_create_audit_logs.sql',
];

async function executeSQL(sql, migrationName) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query: sql });

    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/sql`);
    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function deployMigrations() {
  console.log('🚀 Deploying migrations...\n');

  for (let i = 0; i < migrations.length; i++) {
    const migrationFile = migrations[i];
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', migrationFile);

    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log(`[${i + 1}/${migrations.length}] Running ${migrationFile}...`);

    try {
      await executeSQL(sql, migrationFile);
      console.log(`✅ ${migrationFile}`);
    } catch (error) {
      console.error(`❌ Failed to deploy ${migrationFile}:`);
      console.error(`   ${error.message}`);
      console.error('\n⚠️  Deployment halted. Check the error above.');
      process.exit(1);
    }
  }

  console.log('\n✅ All migrations deployed successfully!');
}

deployMigrations().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});
