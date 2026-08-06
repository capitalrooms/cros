-- Migration: Add tenant user itsharryb@protonmail.com to Room 2 of 12 Dummy Way property
-- Date: 2026-08-04

-- Add property: 12 Dummy Way, E14 3GX, London
INSERT INTO public.properties (name, address, created_at, updated_at)
VALUES ('12 Dummy Way', 'E14 3GX, London', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Create 12 rooms for the property (if they don't exist)
INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 1', 'Bedroom 1', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 2', 'Bedroom 2', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 3', 'Bedroom 3', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 4', 'Bedroom 4', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 5', 'Bedroom 5', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 6', 'Bedroom 6', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 7', 'Bedroom 7', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 8', 'Bedroom 8', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 9', 'Bedroom 9', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 10', 'Bedroom 10', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 11', 'Bedroom 11', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

INSERT INTO public.rooms (property_id, name, description, created_at, updated_at)
SELECT p.id, 'Room 12', 'Bedroom 12', NOW(), NOW()
FROM public.properties p
WHERE p.address = 'E14 3GX, London' AND p.name = '12 Dummy Way'
ON CONFLICT DO NOTHING;

-- Add tenant itsharryb@protonmail.com assigned to Room 2
INSERT INTO public.people (email, role, property_id, room_id, created_at, updated_at)
SELECT 'itsharryb@protonmail.com', 'tenant', p.id, r.id, NOW(), NOW()
FROM public.properties p
LEFT JOIN public.rooms r ON r.property_id = p.id AND r.name = 'Room 2'
WHERE p.name = '12 Dummy Way' AND p.address = 'E14 3GX, London'
ON CONFLICT (email) DO UPDATE SET
  property_id = EXCLUDED.property_id,
  room_id = EXCLUDED.room_id,
  updated_at = NOW();
