const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

async function runMigrations() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fihjzzxxhprxgjuefgtb.supabase.co'
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const migrations = [
    './supabase/migrations/025_create_compliance_logs.sql',
    './supabase/migrations/026_create_tenant_self_checks.sql',
    './supabase/migrations/027_create_tenant_acknowledgment_notes.sql'
  ]

  console.log('🚀 Running migrations...\n')

  for (const filePath of migrations) {
    const fileName = filePath.split('/').pop()
    console.log(`📋 Running: ${fileName}`)

    try {
      const sql = fs.readFileSync(filePath, 'utf8')
      
      // Split by semicolon and execute each statement
      const statements = sql.split(';').filter(s => s.trim())
      
      for (const statement of statements) {
        const { error } = await supabase.rpc('sql', { query: statement + ';' })
        if (error) {
          console.error(`  ❌ Error: ${error.message}`)
        }
      }
      
      console.log(`✅ ${fileName} completed\n`)
    } catch (err) {
      console.error(`❌ Error: ${err.message}`)
    }
  }

  console.log('✨ All migrations processed!')
}

runMigrations()
