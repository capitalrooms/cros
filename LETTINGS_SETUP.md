# Lettings Dashboard Setup

The Lettings Dashboard requires database migrations to be applied to your Supabase project.

## Current Status

The database schema is incomplete:
- ✅ Properties table exists
- ✅ Rooms table exists (but missing lettings columns)
- ❌ Viewings table does NOT exist
- ❌ Lettings schema columns NOT added to rooms table

## What Needs to Be Done

Run the following SQL migration in your Supabase project's SQL Editor.

### Option 1: Use Supabase Web Console (Recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy the SQL from: `supabase/migrations/012_complete_lettings_setup.sql`
6. Paste it into the editor
7. Click **Run** button

### Option 2: Use Supabase CLI (If installed)

```bash
supabase db push
```

## SQL Migration

Here's the complete SQL that needs to be run:

```sql
-- Add lettings columns to rooms table
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'occupied',
ADD COLUMN IF NOT EXISTS previous_rent NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS current_asking_rent NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS available_date DATE,
ADD COLUMN IF NOT EXISTS days_on_market INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketing_status VARCHAR(50) DEFAULT 'not_listed',
ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false;

-- Create viewings table
CREATE TABLE IF NOT EXISTS public.viewings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  viewing_date DATE NOT NULL,
  viewing_slot VARCHAR(50),
  visitor_name VARCHAR(255),
  visitor_email VARCHAR(255),
  visitor_phone VARCHAR(20),
  viewing_status VARCHAR(50) DEFAULT 'scheduled',
  feedback TEXT,
  viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_available_date ON public.rooms(available_date);
CREATE INDEX IF NOT EXISTS idx_rooms_is_priority ON public.rooms(is_priority);
CREATE INDEX IF NOT EXISTS idx_viewings_room_id ON public.viewings(room_id);
CREATE INDEX IF NOT EXISTS idx_viewings_viewing_date ON public.viewings(viewing_date);
CREATE INDEX IF NOT EXISTS idx_viewings_viewing_status ON public.viewings(viewing_status);

-- Enable RLS
ALTER TABLE public.viewings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for development)
DROP POLICY IF EXISTS "anyone_can_read_rooms" ON public.rooms;
CREATE POLICY "anyone_can_read_rooms" ON public.rooms FOR SELECT USING (true);

DROP POLICY IF EXISTS "anyone_can_read_viewings" ON public.viewings;
CREATE POLICY "anyone_can_read_viewings" ON public.viewings FOR SELECT USING (true);

DROP POLICY IF EXISTS "authenticated_can_insert_viewings" ON public.viewings;
CREATE POLICY "authenticated_can_insert_viewings" ON public.viewings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_can_update_viewings" ON public.viewings;
CREATE POLICY "authenticated_can_update_viewings" ON public.viewings
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Update sample room data
UPDATE public.rooms
SET
  status = 'available',
  current_asking_rent = 800.00,
  previous_rent = 750.00,
  days_on_market = 30,
  marketing_status = 'listed',
  is_priority = false
WHERE status IS NULL OR status = 'occupied';
```

## Verify Setup

After running the migration, visit: `http://localhost:3000/api/setup-lettings?key=development`

You should see a response indicating the schema is ready.

## Test Users

The following test accounts are available:

- **Lettings user**: `lettings@capitalrooms.co.uk` (password: needs to be set in Supabase)
- **Admin**: `harry@capitalrooms.co.uk` (password: needs to be set in Supabase)
- **Tenant**: `itsharryb@protonmail.com`

To create test accounts in Supabase:
1. Go to **Authentication** > **Users**
2. Click **Add user**
3. Create a user with email and temporary password
4. The role will be automatically assigned based on the `people` table

## Features

Once the schema is set up, the lettings dashboard will have:

- ✅ Room inventory by property
- ✅ Room status tracking (occupied, available, on notice)
- ✅ Viewing management with notes
- ✅ Tenant notifications for scheduled viewings
- ✅ Rent tracking (previous and current asking rent)
- ✅ Priority property highlighting

## Troubleshooting

If migrations still don't work, you can manually create the objects using:

```
psql postgresql://[connection-string] < supabase/migrations/012_complete_lettings_setup.sql
```

Or contact Supabase support if you have connection issues.
