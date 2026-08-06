-- Update people table to include lettings role
-- First, drop the existing check constraint
ALTER TABLE public.people
DROP CONSTRAINT IF EXISTS people_role_check;

-- Add new check constraint that includes lettings
ALTER TABLE public.people
ADD CONSTRAINT people_role_check
CHECK (role in ('administrator', 'tenant', 'contractor', 'cleaner', 'landlord', 'lettings'));
