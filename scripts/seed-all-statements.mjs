#!/usr/bin/env node

/**
 * Seed all 15 landlord statements with accurate financial data
 * This is the template for seeding statements for any property
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fihjzzxxhprxgjuefgtb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaGp6enh4aHByeGdqdWVmZ3RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTg3MDA0MywiZXhwIjoyMTAxNDQ2MTQzfQ.WUxU1VWaQc4jpVuOJb7GLqe2ZN4v5C4HIm0HDYZev0k';

// All 15 statements with accurate financial data
const STATEMENTS = [
  { ref: 'LS0793', date: '2025-07-07', periodStart: '2025-07-01', periodEnd: '2025-07-31', gross: 6780.00, mgmt: 813.60, charges: 567.28, net: 5399.12 },
  { ref: 'LS0801', date: '2025-08-07', periodStart: '2025-08-01', periodEnd: '2025-08-31', gross: 6400.00, mgmt: 768.00, charges: 618.48, net: 5013.52 },
  { ref: 'LS0817', date: '2025-09-07', periodStart: '2025-09-01', periodEnd: '2025-09-30', gross: 7000.00, mgmt: 840.00, charges: 625.26, net: 5534.74 },
  { ref: 'LS0833', date: '2025-10-07', periodStart: '2025-10-01', periodEnd: '2025-10-31', gross: 5800.00, mgmt: 696.00, charges: 540.02, net: 4563.98 },
  { ref: 'LS0852', date: '2025-11-07', periodStart: '2025-11-01', periodEnd: '2025-11-30', gross: 5200.00, mgmt: 624.00, charges: 977.18, net: 3599.82 },
  { ref: 'LS0893', date: '2025-11-14', periodStart: '2025-11-14', periodEnd: '2025-12-31', gross: 2000.00, mgmt: 240.00, charges: 761.86, net: 998.14 },
  { ref: 'LS0901', date: '2025-12-07', periodStart: '2025-12-01', periodEnd: '2025-12-31', gross: 5700.00, mgmt: 684.00, charges: 469.16, net: 4546.84 },
  { ref: 'LS0919', date: '2026-01-07', periodStart: '2026-01-01', periodEnd: '2026-01-31', gross: 7100.00, mgmt: 852.00, charges: 604.98, net: 5643.02 },
  { ref: 'LS0932', date: '2026-02-07', periodStart: '2026-02-01', periodEnd: '2026-02-28', gross: 7700.00, mgmt: 924.00, charges: 894.64, net: 4881.36 },
  { ref: 'LS0948', date: '2026-03-07', periodStart: '2026-03-01', periodEnd: '2026-03-31', gross: 6300.00, mgmt: 756.00, charges: 585.74, net: 4958.26 },
  { ref: 'LS0959', date: '2026-04-07', periodStart: '2026-04-01', periodEnd: '2026-04-30', gross: 6200.00, mgmt: 744.00, charges: 532.96, net: 4924.04 },
  { ref: 'LS0975', date: '2026-05-07', periodStart: '2026-05-01', periodEnd: '2026-05-31', gross: 5600.00, mgmt: 672.00, charges: 407.98, net: 3520.02 },
  { ref: 'LS0978', date: '2026-05-14', periodStart: '2026-05-14', periodEnd: '2026-06-30', gross: 2400.00, mgmt: 288.00, charges: 179.23, net: 1932.77 },
  { ref: 'LS0987', date: '2026-06-07', periodStart: '2026-06-01', periodEnd: '2026-06-30', gross: 5650.00, mgmt: 678.00, charges: 445.02, net: 3526.98 },
  { ref: 'LS1001', date: '2026-07-07', periodStart: '2026-07-01', periodEnd: '2026-07-31', gross: 7200.00, mgmt: 864.00, charges: 645.77, net: 5690.23 },
];

async function seedStatements() {
  console.log('🌱 Seeding landlord statements...\n');

  try {
    // Create admin Supabase client
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Step 1: Get landlord and property
    console.log('📋 Finding landlord and property...');
    const { data: landlords, error: landlordError } = await supabase
      .from('people')
      .select('id')
      .eq('role', 'landlord')
      .limit(1);

    if (landlordError || !landlords || landlords.length === 0) {
      throw new Error(`Could not find landlord: ${landlordError?.message || 'Not found'}`);
    }
    const landlordId = landlords[0].id;
    console.log(`✓ Found landlord: ${landlordId}\n`);

    const { data: properties, error: propError } = await supabase
      .from('properties')
      .select('id, name, address')
      .ilike('address', '%71 Alloa Road%')
      .limit(1);

    if (propError || !properties || properties.length === 0) {
      throw new Error(`Could not find property: ${propError?.message || 'Not found'}`);
    }
    const propertyId = properties[0].id;
    console.log(`✓ Found property: ${properties[0].name} (${properties[0].address})\n`);

    // Step 2: Insert all statements
    console.log('💾 Inserting statements...');
    let insertedCount = 0;

    for (const stmt of STATEMENTS) {
      const { error: insertError } = await supabase
        .from('landlord_statements')
        .insert([
          {
            landlord_id: landlordId,
            property_id: propertyId,
            statement_reference: stmt.ref,
            statement_date: stmt.date,
            period_start: stmt.periodStart,
            period_end: stmt.periodEnd,
            gross_rent: stmt.gross,
            management_fees: stmt.mgmt,
            property_charges: stmt.charges,
            net_to_landlord: stmt.net,
            amount_paid: stmt.net,
            paid_date: stmt.date,
          },
        ]);

      if (insertError) {
        if (insertError.code === '23505') {
          console.log(`  ℹ️  ${stmt.ref}: Already exists`);
        } else {
          console.warn(`  ❌ ${stmt.ref}: ${insertError.message}`);
        }
      } else {
        console.log(`  ✓ ${stmt.ref}: Inserted`);
        insertedCount++;
      }
    }

    console.log(`\n✅ Complete! ${insertedCount} new statements + existing = ${STATEMENTS.length} total\n`);

    // Step 3: Verify
    console.log('📊 Final verification...');
    const { data: verify } = await supabase
      .from('landlord_statements')
      .select('statement_reference, statement_date, gross_rent, net_to_landlord')
      .eq('landlord_id', landlordId)
      .eq('property_id', propertyId)
      .order('statement_date', { ascending: false });

    console.log(`\nStatements in database: ${verify?.length || 0}`);
    console.log('\nRecent statements:');
    console.log('─'.repeat(70));
    verify?.slice(0, 5).forEach(s => {
      const date = new Date(s.statement_date).toLocaleDateString('en-GB');
      console.log(`${s.statement_reference} (${date}): £${s.gross_rent} gross → £${s.net_to_landlord} net`);
    });
    console.log('─'.repeat(70));

    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

await seedStatements().then(success => process.exit(success ? 0 : 1));
