const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const SUPABASE_URL = 'https://fihjzzxxhprxgjuefgtb.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaGp6enh4aHByeGdqdWVmZ3RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTg3MDA0MywiZXhwIjoyMTAxNDQ2MTQzfQ.WUxU1VWaQc4jpVuOJb7GLqe2ZN4v5C4HIm0HDYZev0k'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const migrations = [
  './supabase/migrations/025_create_compliance_logs.sql',
  './supabase/migrations/026_create_tenant_self_checks.sql',
  './supabase/migrations/027_create_tenant_acknowledgment_notes.sql'
]

async function runMigrations() {
  console.log('🚀 Running migrations...\n')
  
  for (const filePath of migrations) {
    const fileName = filePath.split('/').pop()
    console.log(`📋 Running: ${fileName}`)
    
    try {
      const sql = fs.readFileSync(filePath, 'utf8')
      
      const { data, error } = await supabase.rpc('sql', { query: sql })
      
      if (error) {
        console.error(`❌ Error: ${error.message}`)
      } else {
        console.log(`✅ ${fileName} completed\n`)
      }
    } catch (err) {
      console.error(`❌ Error reading or executing ${fileName}:`, err.message)
    }
  }
  
  console.log('✨ All migrations completed!')
}

runMigrations().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
