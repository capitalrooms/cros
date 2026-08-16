#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = 'https://fihjzzxxhprxgjuefgtb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaGp6enh4aHByeGdqdWVmZ3RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTg3MDA0MywiZXhwIjoyMTAxNDQ2MTQzfQ.WUxU1VWaQc4jpVuOJb7GLqe2ZN4v5C4HIm0HDYZev0k';

// Initialize Supabase with service role
const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkExistingStatements() {
  console.log('Checking existing statements...\n');

  const { data: statements, error } = await adminSupabase
    .from('landlord_statements')
    .select('id, statement_reference, statement_date, gross_rent, net_to_landlord')
    .order('statement_date', { ascending: false });

  if (error) {
    console.error('Error fetching statements:', error);
    return;
  }

  console.log(`Found ${statements.length} statements:\n`);
  statements.forEach((s, i) => {
    console.log(`${i + 1}. ${s.statement_reference} (${s.statement_date})`);
    console.log(`   Gross: £${s.gross_rent?.toFixed(2)}, Net: £${s.net_to_landlord?.toFixed(2)}`);
  });
}

async function main() {
  try {
    await checkExistingStatements();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
