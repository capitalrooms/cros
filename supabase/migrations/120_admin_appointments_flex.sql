-- Make admin_appointments flexible for off-system / custom-address bookings
-- and add missing columns the modal UI expects.

-- 1. Make property_id nullable (needed for custom-address appointments)
ALTER TABLE public.admin_appointments
  ALTER COLUMN property_id DROP NOT NULL;

-- 2. Make admin_id nullable (modal doesn't always have the person id at insert time)
ALTER TABLE public.admin_appointments
  ALTER COLUMN admin_id DROP NOT NULL;

-- 3. Make title nullable (we generate it from type in code)
ALTER TABLE public.admin_appointments
  ALTER COLUMN title DROP NOT NULL;

-- 4. Add appointment_time column (the slot column is named differently)
ALTER TABLE public.admin_appointments
  ADD COLUMN IF NOT EXISTS appointment_time VARCHAR(50);

-- 5. Add notes column (separate from description)
ALTER TABLE public.admin_appointments
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 6. Add notification_message column
ALTER TABLE public.admin_appointments
  ADD COLUMN IF NOT EXISTS notification_message TEXT;

-- 7. Add custom_location column for off-system addresses
ALTER TABLE public.admin_appointments
  ADD COLUMN IF NOT EXISTS custom_location TEXT;

-- 8. Add type column alias (schema uses appointment_type; modal sends type)
ALTER TABLE public.admin_appointments
  ADD COLUMN IF NOT EXISTS type VARCHAR(50);
