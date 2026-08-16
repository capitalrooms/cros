#!/usr/bin/env node

/**
 * Verify landlord statements are properly seeded and display correctly
 * Run with: node scripts/verify-statements.js
 */

const fs = require('fs');
const path = require('path');

// Configuration from .env.local
const SUPABASE_URL = 'https://fihjzzxxhprxgjuefgtb.supabase.co';
const ANON_KEY = 'sb_publishable_apKuf2BqWZ-dGNXiyoWhlQ_T2nttJ73';

// Expected statements (from the seed migration)
const EXPECTED_STATEMENTS = [
  { ref: 'LS0793', date: '2025-07-07', gross: 6780.00, net: 5399.12 },
  { ref: 'LS0801', date: '2025-08-07', gross: 6400.00, net: 5013.52 },
  { ref: 'LS0817', date: '2025-09-07', gross: 7000.00, net: 5534.74 },
  { ref: 'LS0833', date: '2025-10-07', gross: 5800.00, net: 4563.98 },
  { ref: 'LS0852', date: '2025-11-07', gross: 5200.00, net: 3599.82 },
  { ref: 'LS0893', date: '2025-11-14', gross: 2000.00, net: 998.14 },
  { ref: 'LS0901', date: '2025-12-07', gross: 5700.00, net: 4546.84 },
  { ref: 'LS0919', date: '2026-01-07', gross: 7100.00, net: 5643.02 },
  { ref: 'LS0932', date: '2026-02-07', gross: 7700.00, net: 4881.36 },
  { ref: 'LS0948', date: '2026-03-07', gross: 6300.00, net: 4958.26 },
  { ref: 'LS0959', date: '2026-04-07', gross: 6200.00, net: 4924.04 },
  { ref: 'LS0975', date: '2026-05-07', gross: 5600.00, net: 3520.02 },
  { ref: 'LS0978', date: '2026-05-14', gross: 2400.00, net: 1932.77 },
  { ref: 'LS0987', date: '2026-06-07', gross: 5650.00, net: 3526.98 },
  { ref: 'LS1001', date: '2026-07-07', gross: 7200.00, net: 5690.23 },
];

async function checkStatements() {
  console.log('Checking landlord statements...\n');

  try {
    // Fetch statements using REST API with anon key
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/landlord_statements?select=id,statement_reference,statement_date,gross_rent,net_to_landlord&order=statement_date.desc`,
      {
        headers: {
          'apikey': ANON_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`API Error: ${response.status}`);
      const text = await response.text();
      console.error(text);
      return;
    }

    const statements = await response.json();
    console.log(`Found ${statements.length} statements in database\n`);

    if (statements.length === 0) {
      console.log('⚠️  No statements found! Database might not be seeded.\n');
      console.log('To seed the database, run:');
      console.log('  psql $DATABASE_URL < supabase/migrations/043-seed-landlord-statements.sql\n');
      return;
    }

    // Display current statements
    console.log('Current statements:');
    console.log('─'.repeat(70));
    statements.forEach((stmt, i) => {
      const date = new Date(stmt.statement_date).toLocaleDateString('en-GB');
      console.log(`${i + 1}. ${stmt.statement_reference} (${date})`);
      console.log(`   Gross: £${parseFloat(stmt.gross_rent).toFixed(2).padStart(8)}, Net: £${parseFloat(stmt.net_to_landlord).toFixed(2).padStart(8)}`);
    });
    console.log('─'.repeat(70));
    console.log();

    // Verify data accuracy
    console.log('Data Verification:');
    console.log('─'.repeat(70));

    let allCorrect = true;
    EXPECTED_STATEMENTS.forEach((expected) => {
      const actual = statements.find(s => s.statement_reference === expected.ref);
      if (!actual) {
        console.log(`❌ ${expected.ref}: MISSING`);
        allCorrect = false;
      } else {
        const grossMatch = parseFloat(actual.gross_rent).toFixed(2) === parseFloat(expected.gross).toFixed(2);
        const netMatch = parseFloat(actual.net_to_landlord).toFixed(2) === parseFloat(expected.net).toFixed(2);

        if (grossMatch && netMatch) {
          console.log(`✓ ${expected.ref}: Data correct`);
        } else {
          console.log(`❌ ${expected.ref}: Data mismatch`);
          if (!grossMatch) console.log(`   Gross: Expected £${expected.gross}, Got £${parseFloat(actual.gross_rent).toFixed(2)}`);
          if (!netMatch) console.log(`   Net: Expected £${expected.net}, Got £${parseFloat(actual.net_to_landlord).toFixed(2)}`);
          allCorrect = false;
        }
      }
    });

    console.log('─'.repeat(70));
    console.log();

    if (allCorrect && statements.length === EXPECTED_STATEMENTS.length) {
      console.log('✅ All statements are correctly seeded and data is accurate!\n');
      return 0;
    } else {
      console.log(`⚠️  ${statements.length}/${EXPECTED_STATEMENTS.length} statements present`);
      if (!allCorrect) {
        console.log('Some data mismatches detected.\n');
      }
      return 1;
    }
  } catch (error) {
    console.error('Error checking statements:', error.message);
    return 1;
  }
}

// Run verification
checkStatements().then(code => process.exit(code || 0));
