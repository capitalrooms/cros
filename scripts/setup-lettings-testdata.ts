/**
 * Setup script: Create lettings test user and sample data
 * Run with: npx ts-node scripts/setup-lettings-testdata.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupLettingsTestData() {
  console.log('Setting up Lettings test data...\n');

  try {
    // 1. Create lettings user in people table
    console.log('1. Creating lettings user...');
    const { data: lettingsUser, error: userError } = await supabase
      .from('people')
      .insert([
        {
          email: 'lettings@capitalrooms.co.uk',
          role: 'lettings',
          name: 'Lettings Team',
        },
      ])
      .select()
      .single();

    if (userError) {
      console.error('Error creating lettings user:', userError);
      // Continue anyway - user might already exist
    } else {
      console.log('✓ Lettings user created:', lettingsUser?.email);
    }

    // 2. Get first property (should exist from seed data)
    console.log('\n2. Getting properties...');
    const { data: properties } = await supabase
      .from('properties')
      .select('*')
      .limit(1);

    if (!properties || properties.length === 0) {
      console.error('No properties found. Please create a property first.');
      process.exit(1);
    }

    const propertyId = properties[0].id;
    console.log('✓ Using property:', properties[0].name);

    // 3. Update rooms with lettings data
    console.log('\n3. Updating rooms with lettings data...');
    const { data: rooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('property_id', propertyId);

    if (rooms && rooms.length > 0) {
      // Update first room as available
      await supabase
        .from('rooms')
        .update({
          status: 'available',
          current_rent: null,
          asking_rent: 1200,
          available_date: new Date().toISOString().split('T')[0],
          days_on_market: 15,
          marketing_status: 'listed',
        })
        .eq('id', rooms[0].id);
      console.log('✓ Room 1 set as available');

      // Update second room as on notice if it exists
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
        console.log('✓ Room 2 set as on notice');
      }

      // Update third room as occupied if it exists
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
        console.log('✓ Room 3 set as occupied');
      }
    }

    // 4. Create sample viewings
    console.log('\n4. Creating sample viewings...');
    const viewingDates = [
      new Date().toISOString().split('T')[0], // Today
      new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
      new Date(Date.now() + 172800000).toISOString().split('T')[0], // In 2 days
      new Date(Date.now() + 259200000).toISOString().split('T')[0], // In 3 days
    ];

    if (rooms && rooms.length > 0) {
      const viewings = viewingDates.map((date, idx) => ({
        room_id: rooms[0].id,
        viewing_date: date,
        viewing_slot: ['9-12', '12-15', '15-18'][idx % 3],
        status: 'scheduled' as const,
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

      const { error: viewingsError } = await supabase
        .from('viewings')
        .insert(viewings);

      if (viewingsError) {
        console.error('Error creating viewings:', viewingsError);
      } else {
        console.log('✓ Created 4 sample viewings');
      }
    }

    // 5. Create sample rent records
    console.log('\n5. Creating sample rent records...');
    if (rooms && rooms.length > 0) {
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
          room_id: rooms[rooms.length - 1]?.id || rooms[0].id,
          tenant_email: 'tenant2@example.com',
          amount_due: 1100,
          amount_paid: 1100,
          due_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          status: 'paid',
          notes: 'Paid on time',
        },
        {
          room_id: rooms[1]?.id || rooms[0].id,
          tenant_email: 'tenant3@example.com',
          amount_due: 950,
          amount_paid: 500,
          due_date: new Date(Date.now() - 172800000).toISOString().split('T')[0],
          status: 'overdue',
          notes: 'Partial payment, chasing remainder',
        },
      ];

      const { error: rentError } = await supabase
        .from('rent_tracking')
        .insert(rentRecords);

      if (rentError) {
        console.error('Error creating rent records:', rentError);
      } else {
        console.log('✓ Created 3 sample rent records');
      }
    }

    console.log('\n✅ Setup complete!');
    console.log('\nTest Login:');
    console.log('  Email: lettings@capitalrooms.co.uk');
    console.log('  URL: http://localhost:3000/login');
    console.log('  Dashboard: http://localhost:3000/lettings');
  } catch (err) {
    console.error('Setup failed:', err);
    process.exit(1);
  }
}

setupLettingsTestData();
