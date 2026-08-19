import { createServiceClient } from '@/lib/supabase'

/**
 * One-time setup endpoint to create the offers table.
 * This should be called once to initialize the database schema.
 * In production, this would be run via migrations.
 *
 * POST /api/setup/create-offers-table
 */
export async function POST(request: Request) {
  try {
    const supabase = createServiceClient()

    const sql = `
      CREATE TABLE IF NOT EXISTS public.offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
        property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
        applicant_email VARCHAR(255) NOT NULL,
        applicant_name VARCHAR(255),
        advertised_rent DECIMAL(10,2),
        move_in_date DATE,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        sent_by UUID REFERENCES public.people(id),
        status VARCHAR(50) DEFAULT 'sent',
        application_token VARCHAR(255) UNIQUE,
        token_expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_offers_room_id ON public.offers(room_id);
      CREATE INDEX IF NOT EXISTS idx_offers_property_id ON public.offers(property_id);
      CREATE INDEX IF NOT EXISTS idx_offers_email ON public.offers(applicant_email);
      CREATE INDEX IF NOT EXISTS idx_offers_token ON public.offers(application_token);
      CREATE INDEX IF NOT EXISTS idx_offers_status ON public.offers(status);
    `

    // Execute the SQL using the service client
    const { error } = await supabase.rpc('exec', { query: sql }).catch(() => ({
      error: { message: 'RPC not available' }
    }))

    if (error?.message === 'RPC not available') {
      // If RPC isn't available, return instructions for manual setup
      return Response.json(
        {
          success: false,
          message: 'RPC method not available. Please run the following SQL manually in Supabase console:',
          sql: sql.trim(),
          instructions: [
            '1. Go to https://supabase.co/dashboard/projects',
            '2. Select your project (fihjzzxxhprxgjuefgtb)',
            '3. Click SQL Editor on the left',
            '4. Click "New Query"',
            '5. Paste the SQL above',
            '6. Click "Run"'
          ]
        },
        { status: 400 }
      )
    }

    if (error) {
      console.error('Error creating table:', error)
      return Response.json(
        { error: 'Failed to create table', details: error.message },
        { status: 500 }
      )
    }

    return Response.json(
      { success: true, message: 'Offers table created successfully' },
      { status: 201 }
    )
  } catch (err) {
    console.error('Setup error:', err)
    return Response.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    )
  }
}
