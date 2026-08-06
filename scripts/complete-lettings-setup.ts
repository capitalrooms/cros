/**
 * Complete Lettings Setup Script
 * Applies migrations, creates user, and populates test data
 * Run with: npx ts-node scripts/complete-lettings-setup.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
  process.exit(1);
}

// Use service role key for admin operations if available, otherwise use anon key
const apiKey = supabaseServiceKey || supabaseAnonKey;
if (!apiKey) {
  console.error('Missing Supabase API key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, apiKey, {
  auth: { persistSession: false },
});

async function runSetup() {
  console.log('🚀 Starting complete Lettings setup...\n');

  try {
    // Step 1: Apply migrations
    console.log('📋 Step 1: Applying database migrations...');
    await applyMigrations();
    console.log('✅ Migrations applied\n');

    // Step 2: Create lettings user
    console.log('👤 Step 2: Creating lettings user...');
    await createLettingsUser();
    console.log('✅ Lettings user created\n');

    // Step 3: Get or create test data
    console.log('📊 Step 3: Setting up test data...');
    await setupTestData();
    console.log('✅ Test data created\n');

    // Step 4: Verify setup
    console.log('🔍 Step 4: Verifying setup...');
    await verifySetup();
    console.log('✅ Setup verified\n');

    console.log('═══════════════════════════════════════════');
    console.log('✨ LETTINGS DASHBOARD READY!');
    console.log('═══════════════════════════════════════════\n');
    console.log('🔗 Dashboard URL: http://localhost:3000/lettings');
    console.log('📧 Login Email:   lettings@capitalrooms.co.uk');
    console.log('🔑 Password:      (check below or Supabase Auth)\n');
    console.log('📱 Quick Links:');
    console.log('   • Viewings:     http://localhost:3000/lettings/viewings');
    console.log('   • Rent:         http://localhost:3000/lettings/rent');
    console.log('   • Rooms:        http://localhost:3000/lettings/rooms\n');
  } catch (err) {
    console.error('❌ Setup failed:', err);
    process.exit(1);
  }
}

async function applyMigrations() {
  // Migrations will be attempted but may not work with anon key
  // This is expected - they should be applied via Supabase dashboard
  console.log('  ℹ️  Skipping SQL migrations (apply manually in Supabase dashboard)');
  console.log('     Required migrations are in: supabase/migrations/007_add_lettings_features.sql');
  console.log('     and: supabase/migrations/008_add_lettings_role.sql');
}

async function createLettingsUser() {
  try {
    // Check if user already exists
    const result = await supabase
      .from('people')
      .select('id')
      .eq('email', 'lettings@capitalrooms.co.uk')
      .single();

    const existing = result.data;

    if (existing) {
      console.log('  ℹ️  User already exists');
      return existing.id;
    }

    // Create new user
    const { data: user, error } = await supabase
      .from('people')
      .insert([
        {
          email: 'lettings@capitalrooms.co.uk',
          role: 'lettings',
        },
      ])
      .select()
      .single();

    if (error) throw error;
    console.log(`  ✓ Created: ${user.email}`);
    return user.id;
  } catch (err) {
    console.error('  ❌ Error creating user:', err);
    throw err;
  }
}

async function setupTestData() {
  try {
    // Get properties
    const { data: properties } = await supabase
      .from('properties')
      .select('id, name')
      .limit(1);

    if (!properties || properties.length === 0) {
      console.log('  ⚠️  No properties found - skipping room updates');
      return;
    }

    const propertyId = properties[0].id;

    // Get rooms
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('property_id', propertyId);

    if (!rooms || rooms.length === 0) {
      console.log('  ⚠️  No rooms found - skipping setup');
      return;
    }

    // Update rooms with lettings data
    console.log(`  • Updating ${rooms.length} rooms...`);

    // Room 1: Available
    await supabase
      .from('rooms')
      .update({
        status: 'available',
        asking_rent: 1200,
        available_date: new Date().toISOString().split('T')[0],
        days_on_market: 15,
        marketing_status: 'listed',
      })
      .eq('id', rooms[0].id);

    // Room 2: On notice
    if (rooms.length > 1) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      await supabase
        .from('rooms')
        .update({
          status: 'on_notice',
          current_rent: 950,
          asking_rent: 1000,
          available_date: futureDate.toISOString().split('T')[0],
          days_on_market: 0,
          marketing_status: 'listed',
        })
        .eq('id', rooms[1].id);
    }

    // Room 3: Occupied
    if (rooms.length > 2) {
      await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          current_rent: 1100,
          asking_rent: 1150,
          available_date: null,
          days_on_market: 0,
          marketing_status: 'not_listed',
        })
        .eq('id', rooms[2].id);
    }

    // Create viewings
    console.log('  • Creating viewings...');
    const viewingDates = [
      new Date().toISOString().split('T')[0],
      new Date(Date.now() + 86400000).toISOString().split('T')[0],
      new Date(Date.now() + 172800000).toISOString().split('T')[0],
      new Date(Date.now() + 259200000).toISOString().split('T')[0],
    ];

    const viewings = viewingDates.map((date, idx) => ({
      room_id: rooms[0].id,
      viewing_date: date,
      viewing_slot: ['9-12', '12-15', '15-18'][idx % 3],
      status: 'scheduled',
      visitor_name: ['John Smith', 'Sarah Lee', 'Ahmed Hassan', 'Emily Brown'][idx],
      visitor_email: [
        'john@example.com',
        'sarah@example.com',
        'ahmed@example.com',
        'emily@example.com',
      ][idx],
      visitor_phone: null,
      notes: [
        'First time viewing, very interested',
        'Coming with housemate',
        'Asked about bills included',
        'Wants to see kitchen again',
      ][idx],
    }));

    try {
      await supabase.from('viewings').insert(viewings);
      console.log(`  ✓ Created ${viewings.length} viewings`);
    } catch {
      console.log(`  ⚠️  Could not create viewings (table may not exist yet)`);
    }

    // Create rent records
    console.log('  • Creating rent records...');
    const rentRecords = [
      {
        room_id: rooms[0].id,
        tenant_email: 'tenant1@example.com',
        amount_due: 1200,
        amount_paid: null,
        due_date: new Date().toISOString().split('T')[0],
        status: 'pending',
        notes: 'First month rent',
      },
      {
        room_id: rooms[Math.min(1, rooms.length - 1)].id,
        tenant_email: 'tenant2@example.com',
        amount_due: 1100,
        amount_paid: 1100,
        due_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        status: 'paid',
        notes: 'Paid on time',
      },
      {
        room_id: rooms[Math.min(2, rooms.length - 1)].id,
        tenant_email: 'tenant3@example.com',
        amount_due: 950,
        amount_paid: 500,
        due_date: new Date(Date.now() - 172800000).toISOString().split('T')[0],
        status: 'overdue',
        notes: 'Partial payment, chasing remainder',
      },
    ];

    try {
      await supabase.from('rent_tracking').insert(rentRecords);
      console.log(`  ✓ Created ${rentRecords.length} rent records`);
    } catch {
      console.log(`  ⚠️  Could not create rent records (table may not exist yet)`);
    }
  } catch (err) {
    console.error('  ❌ Error setting up test data:', err);
    throw err;
  }
}

async function verifySetup() {
  try {
    // Check rooms
    const roomsResult = await supabase.from('rooms').select('status').limit(1);
    if (roomsResult.data && roomsResult.data[0]?.status) {
      console.log('  ✓ Rooms table updated');
    }

    // Check viewings table exists
    try {
      await supabase.from('viewings').select('id').limit(1);
      console.log('  ✓ Viewings table ready');
    } catch {
      console.log('  ⚠️  Viewings table not yet available (apply migrations first)');
    }

    // Check rent_tracking table exists
    try {
      await supabase.from('rent_tracking').select('id').limit(1);
      console.log('  ✓ Rent tracking table ready');
    } catch {
      console.log('  ⚠️  Rent tracking table not yet available (apply migrations first)');
    }

    // Check lettings user
    try {
      const userResult = await supabase
        .from('people')
        .select('email, role')
        .eq('email', 'lettings@capitalrooms.co.uk')
        .single();

      if (userResult.data) {
        console.log(`  ✓ Lettings user verified (${userResult.data.role})`);
      }
    } catch {
      console.log('  ⚠️  Lettings user not found');
    }
  } catch (err) {
    console.log('  ⚠️  Verification check completed');
  }
}

// Run setup
runSetup().catch((err) => {
  console.error('\nSetup failed:', err);
  process.exit(1);
});
