# Setting Up the Lettings Dashboard

Follow these steps to get the Lettings Dashboard working:

## Step 1: Apply Database Schema Migration

The Lettings Dashboard requires several database changes. You need to run SQL in your Supabase project.

### How to Run the Migration

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your Capital Rooms project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy and paste the SQL below
6. Click **Run**

### SQL to Run

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

-- Update sample room data with test values
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

## Step 2: Create a Test Account

You need to create an auth account with the lettings role.

### Method: Supabase Authentication

1. Go to **Authentication** → **Users** in your Supabase dashboard
2. Click **Add user** button
3. Enter:
   - **Email**: `lettings@capitalrooms.co.uk`
   - **Password**: (set a temporary password, e.g., `Test123!`)
   - Make sure "Auto confirm user" is checked
4. Click **Create user**

The system will automatically assign the "lettings" role because you already have a person record for this email (created by the migration).

### Alternative: Create with Admin Role

If you prefer to use an existing admin account:

```sql
-- Update harry@capitalrooms.co.uk to have lettings role
UPDATE public.people SET role = 'lettings' WHERE email = 'harry@capitalrooms.co.uk';
```

Then create an auth account for `harry@capitalrooms.co.uk` and use that to log in.

## Step 3: Access the Lettings Dashboard

1. Go to http://localhost:3000
2. Click on "Sign in"
3. Enter your credentials:
   - Email: `lettings@capitalrooms.co.uk` (or your chosen email)
   - Password: (the password you set)
4. Click **Sign in**
5. You'll be redirected to the Lettings Dashboard

## Features Available

Once logged in, you can:

✅ **View Rooms** — See all rooms organized by property with status badges
✅ **Schedule Viewings** — Add viewings in 15-minute time slots (8:00 AM - 6:00 PM)
✅ **Viewing Notes** — Capture feedback on each viewing (condition, smell, notes, etc.)
✅ **Room Status** — Track rooms as occupied, available, or on notice
✅ **Rent Tracking** — See previous and current asking rent
✅ **Priority Rooms** — Mark and highlight priority listings
✅ **Tenant Notifications** — Notify tenant in room or all other tenants when viewing is scheduled
✅ **Completed Viewings** — Track completed viewings with feedback

## Time Slots

Viewings can be scheduled in **15-minute intervals**:
- 8:00 AM through 6:00 PM
- Select a date and time when adding a viewing
- Time slots are displayed as HH:MM format (e.g., "10:30 am")

## Troubleshooting

### "Invalid login credentials"
- Make sure you created an auth account (step 2)
- Check that the password is correct
- Try recreating the auth user

### "Not recognized" error
- The email address must exist in the `people` table with role = 'lettings'
- Run this SQL to check: `SELECT * FROM public.people WHERE email = 'your@email.com';`
- If missing, insert it: `INSERT INTO public.people (email, role) VALUES ('your@email.com', 'lettings');`

### No rooms showing
- Make sure the schema migration was applied (step 1)
- Check that rooms exist: `SELECT COUNT(*) FROM public.rooms;`
- Verify rooms have property assignments: `SELECT * FROM public.rooms LIMIT 5;`

### Cannot add viewings
- Ensure the viewings table was created (check migration was run)
- Make sure you're authenticated (logged in with lettings role)

## Next Steps

After setup, you can:
- Add test viewing data
- Verify tenant notifications work
- Test room status updates
- Customize rent values and property information
