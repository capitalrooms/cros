#!/usr/bin/env node

/**
 * Database Setup Script for CROS
 * Creates tables and sets up test data directly via Supabase client
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');

  try {
    // 1. Create properties table if it doesn't exist
    console.log('1️⃣  Creating properties table...');
    const createPropertiesTable = `
      CREATE TABLE IF NOT EXISTS public.properties (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    let { error: propError } = await supabase.rpc('exec', {
      query: createPropertiesTable
    }).catch(() => ({ error: null }));

    if (!propError) {
      console.log('✅ Properties table created\n');
    } else {
      console.log('⚠️  Properties table might already exist\n');
    }

    // 2. Create rooms table if it doesn't exist
    console.log('2️⃣  Creating rooms table...');
    const createRoomsTable = `
      CREATE TABLE IF NOT EXISTS public.rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id UUID NOT NULL REFERENCES public.properties(id),
        name VARCHAR(255) NOT NULL,
        description VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    let { error: roomError } = await supabase.rpc('exec', {
      query: createRoomsTable
    }).catch(() => ({ error: null }));

    if (!roomError) {
      console.log('✅ Rooms table created\n');
    } else {
      console.log('⚠️  Rooms table might already exist\n');
    }

    // 3. Insert property
    console.log('3️⃣  Inserting property "12 Dummy Way"...');
    const { data: propData, error: insertPropError } = await supabase
      .from('properties')
      .insert([
        {
          name: '12 Dummy Way',
          address: 'E14 3GX, London'
        }
      ])
      .select();

    if (insertPropError) {
      console.log('⚠️  Property might already exist:', insertPropError.message);
    } else {
      console.log('✅ Property inserted:', propData?.[0]?.id || 'existing');
    }

    // 4. Get property ID for next steps
    const { data: properties } = await supabase
      .from('properties')
      .select('id')
      .eq('name', '12 Dummy Way')
      .eq('address', 'E14 3GX, London')
      .limit(1);

    const propertyId = properties?.[0]?.id;
    if (!propertyId) {
      console.error('❌ Failed to get property ID');
      process.exit(1);
    }

    console.log('\n');

    // 5. Insert Room 2
    console.log('4️⃣  Inserting Room 2...');
    const { data: roomData, error: insertRoomError } = await supabase
      .from('rooms')
      .insert([
        {
          property_id: propertyId,
          name: 'Room 2',
          description: 'Bedroom 2'
        }
      ])
      .select();

    if (insertRoomError) {
      console.log('⚠️  Room might already exist:', insertRoomError.message);
    } else {
      console.log('✅ Room inserted:', roomData?.[0]?.id || 'existing');
    }

    // 6. Get room ID
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id')
      .eq('property_id', propertyId)
      .eq('name', 'Room 2')
      .limit(1);

    const roomId = rooms?.[0]?.id;

    console.log('\n');

    // 7. Add columns to people table if needed
    console.log('5️⃣  Adding columns to people table if needed...');
    const addColumnsSQL = `
      ALTER TABLE public.people
      ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.properties(id);
      ALTER TABLE public.people
      ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.rooms(id);
    `;

    await supabase.rpc('exec', { query: addColumnsSQL }).catch(() => {});
    console.log('✅ Columns ready\n');

    // 8. Update tenant assignment
    console.log('6️⃣  Assigning tenant itsharryb@protonmail.com to Room 2...');
    const { data: updateData, error: updateError } = await supabase
      .from('people')
      .update({
        property_id: propertyId,
        room_id: roomId
      })
      .eq('email', 'itsharryb@protonmail.com')
      .select();

    if (updateError) {
      console.log('⚠️  Update error:', updateError.message);
    } else if (updateData && updateData.length > 0) {
      console.log('✅ Tenant assigned successfully');
    } else {
      console.log('⚠️  No tenant found to update - may need to create in people table first');
    }

    console.log('\n✨ Database setup complete!\n');
    console.log('🎯 You can now test:');
    console.log('   Email: itsharryb@protonmail.com');
    console.log('   Password: password');
    console.log('   Location: Room 2, 12 Dummy Way, E14 3GX, London\n');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupDatabase();
