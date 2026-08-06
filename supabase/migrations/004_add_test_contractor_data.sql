-- Add test contractor user if not exists
INSERT INTO public.people (email, role, created_at, updated_at)
VALUES ('contractor@example.com', 'contractor', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Get IDs for test users
-- Note: These inserts will need the actual UUIDs from the people table
-- For demo purposes, we'll insert test maintenance tickets
-- You can run this after confirming the contractor exists

-- First, ensure we have a test property
INSERT INTO public.properties (name, address, created_at, updated_at)
VALUES ('Test Property - Demo', '123 Test Street, London', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Insert HIGH PRIORITY ticket (Emergency Plumbing)
INSERT INTO public.maintenance_tickets
(property_id, room_id, reporter_id, title, description, category, location, priority, status, created_at, updated_at)
SELECT
  p.id,
  null,
  pe.id,
  'Burst Pipe in Kitchen - URGENT',
  'Water spraying from the main kitchen pipe under the sink. This is actively flooding the area. Immediate attention required.',
  'Plumbing',
  'Kitchen',
  'high',
  'reported',
  NOW(),
  NOW()
FROM public.properties p, public.people pe
WHERE p.name = 'Test Property - Demo'
  AND pe.email = 'john@example.com'
LIMIT 1;

-- Insert LOW PRIORITY ticket (Decoration)
INSERT INTO public.maintenance_tickets
(property_id, room_id, reporter_id, title, description, category, location, priority, status, created_at, updated_at)
SELECT
  p.id,
  null,
  pe.id,
  'Paint Scuff Marks on Hallway Wall',
  'There are several scuff marks and paint damage on the ground floor hallway wall near the stairs. Would like these touched up when possible.',
  'Decoration & Finishes',
  'Ground Floor Hallway',
  'low',
  'reported',
  NOW(),
  NOW()
FROM public.properties p, public.people pe
WHERE p.name = 'Test Property - Demo'
  AND pe.email = 'john@example.com'
LIMIT 1;

-- Notes for implementation:
-- 1. Run this migration to create test tickets
-- 2. The contractor can then view these as "Available Jobs"
-- 3. Demo flow: contractor accepts job → starts work → marks complete
-- 4. For photos: currently just showing as available in UI, need photo upload in form
