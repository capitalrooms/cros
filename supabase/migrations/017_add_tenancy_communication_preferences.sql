-- Add communication preferences and notification opt-ins to tenancies
-- This migration adds per-tenant preferences for how they receive updates

-- 1. Add new columns to tenancies table if they don't exist
ALTER TABLE public.tenancies
ADD COLUMN IF NOT EXISTS communication_preference VARCHAR(20) DEFAULT 'email',
ADD COLUMN IF NOT EXISTS opt_in_maintenance BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS opt_in_viewings BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS opt_in_appointments BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS opt_in_cleaning BOOLEAN DEFAULT true;

-- 2. Create index for common queries
CREATE INDEX IF NOT EXISTS idx_tenancies_communication_preference
ON public.tenancies(communication_preference);

CREATE INDEX IF NOT EXISTS idx_tenancies_opt_ins
ON public.tenancies(opt_in_maintenance, opt_in_viewings, opt_in_appointments, opt_in_cleaning);

-- 3. Add constraint for communication preference
ALTER TABLE public.tenancies
DROP CONSTRAINT IF EXISTS tenancies_communication_preference_check;

ALTER TABLE public.tenancies
ADD CONSTRAINT tenancies_communication_preference_check
CHECK (communication_preference IN ('email', 'text'));

-- 4. Add constraint for status
ALTER TABLE public.tenancies
DROP CONSTRAINT IF EXISTS tenancies_status_check;

ALTER TABLE public.tenancies
ADD CONSTRAINT tenancies_status_check
CHECK (status IN ('active', 'on_notice', 'available'));
