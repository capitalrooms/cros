-- Ensure we have lettings role users

-- Update any existing users to have lettings role if they have administrator role
UPDATE public.people SET role = 'lettings'
WHERE email IN (
  'harry.bu@hotmail.com',
  'admin@capitalrooms.co.uk',
  'lettings@capitalrooms.co.uk'
);

-- Insert default lettings user if doesn't exist
INSERT INTO public.people (email, role, created_at, updated_at)
VALUES ('lettings@capitalrooms.co.uk', 'lettings', NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET role = 'lettings', updated_at = NOW();
