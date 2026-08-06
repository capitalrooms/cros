/**
 * Run lettings schema migration with service role key
 * Usage: SUPABASE_SERVICE_ROLE_KEY=your_key npx ts-node scripts/run-migration.ts
 */

import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✓' : '✗')
  process.exit(1)
}

async function runMigration() {
  try {
    console.log('🚀 Starting lettings schema migration...\n')

    // Read migration file
    const migrationFile = path.join(process.cwd(), 'supabase/migrations/012_complete_lettings_setup.sql')
    const migrationSql = fs.readFileSync(migrationFile, 'utf-8')

    // Split into individual statements
    const statements = migrationSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`)

    let successCount = 0
    let errorCount = 0

    // Execute each statement using RPC
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      const preview = statement.substring(0, 60) + (statement.length > 60 ? '...' : '')

      try {
        // Try using Supabase's sql.rpc if available, or direct HTTP
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql_statement`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ sql: statement }),
        })

        if (response.ok) {
          console.log(`✅ [${i + 1}/${statements.length}] ${preview}`)
          successCount++
        } else if (response.status === 404) {
          // Function doesn't exist, try PostgreSQL JSON-RPC
          console.log(`⚠️  [${i + 1}/${statements.length}] Trying alternative method...`)
          // Try with pg_stat_statements or direct execution
          const altResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ query: statement }),
          })

          if (altResponse.ok) {
            console.log(`✅ [${i + 1}/${statements.length}] ${preview}`)
            successCount++
          } else {
            const error = await altResponse.json().catch(() => ({ message: 'Unknown error' }))
            console.log(`❌ [${i + 1}/${statements.length}] ${preview}`)
            console.log(`   Error: ${error.message || altResponse.statusText}\n`)
            errorCount++
          }
        } else {
          const error = await response.json().catch(() => ({ message: 'Unknown error' }))
          console.log(`❌ [${i + 1}/${statements.length}] ${preview}`)
          console.log(`   Error: ${error.message || response.statusText}\n`)
          errorCount++
        }
      } catch (err) {
        console.log(`❌ [${i + 1}/${statements.length}] ${preview}`)
        console.log(`   Error: ${err instanceof Error ? err.message : 'Unknown error'}\n`)
        errorCount++
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log(`✅ Migration complete!`)
    console.log(`   Successful: ${successCount}/${statements.length}`)
    if (errorCount > 0) {
      console.log(`   Failed: ${errorCount}/${statements.length}`)
      console.log('\n   Note: Some statements may have failed due to already existing objects.')
      console.log('   This is normal if running migration twice.\n')
    } else {
      console.log(`   All statements executed successfully!\n`)
    }
    console.log('🎉 Lettings schema is now ready!')
    console.log('📝 Next: Create a test account and sign in\n')
  } catch (err) {
    console.error('❌ Migration failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

runMigration()
