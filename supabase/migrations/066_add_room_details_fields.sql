-- Migration 066: Add detailed room information fields
-- Support for room type, size, location, features, and furnishings

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS room_type VARCHAR(50), -- e.g., 'double', 'single', 'ensuite', 'shared'
ADD COLUMN IF NOT EXISTS room_size NUMERIC(10, 2), -- e.g., 18.5 (m²)
ADD COLUMN IF NOT EXISTS location_in_house VARCHAR(255), -- e.g., 'First floor, rear'
ADD COLUMN IF NOT EXISTS features TEXT, -- e.g., 'Window, storage, en-suite'
ADD COLUMN IF NOT EXISTS furnishings_description TEXT; -- e.g., 'Bed, desk, wardrobe, storage'

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_rooms_room_type ON public.rooms(room_type);
