-- Add demo property: 12 Dummy Way, E14 3GX
INSERT INTO public.properties (name, address, created_at, updated_at)
VALUES ('12 Dummy Way', 'E14 3GX, London', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Get the property ID (you'll need to use the actual ID from the insert above)
-- For this script, we'll use a SELECT to find it and then create rooms

-- Create 12 rooms for the property
INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 1', 'Bedroom 1', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 2', 'Bedroom 2', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 3', 'Bedroom 3', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 4', 'Bedroom 4', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 5', 'Bedroom 5', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 6', 'Bedroom 6', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 7', 'Bedroom 7', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 8', 'Bedroom 8', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 9', 'Bedroom 9', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 10', 'Bedroom 10', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 11', 'Bedroom 11', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 12', 'Bedroom 12', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London'
AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

-- Assign harry.bu@hotmail.com to Room 1
UPDATE public.people
SET property_id = (
  SELECT p.id FROM public.properties p
  WHERE p.name = '12 Dummy Way' AND p.address = 'E14 3GX, London'
  LIMIT 1
),
room_id = (
  SELECT r.id FROM public.rooms r
  JOIN public.properties p ON r.property_id = p.id
  WHERE p.name = '12 Dummy Way' AND p.address = 'E14 3GX, London' AND r.name = 'Room 1'
  LIMIT 1
)
WHERE email = 'harry.bu@hotmail.com';
