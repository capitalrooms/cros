-- Migration 070: Add unit_code field to rooms table
-- Stores the unit identification code (e.g., 012SAS = Property 012 + Tenant Name initials)
-- Used for ordering and identifying units across properties

ALTER TABLE public.rooms
  ADD COLUMN unit_code VARCHAR(10) UNIQUE;

-- Add index for efficient sorting and lookups
CREATE INDEX IF NOT EXISTS idx_rooms_unit_code ON public.rooms(unit_code);

-- Add comment for documentation
COMMENT ON COLUMN public.rooms.unit_code IS 'Unit code format: PROPERTY_NUMBER + FIRST_TWO_CHARS_OF_FIRST_NAME + FIRST_CHAR_OF_SECOND_NAME (e.g., 012SAS)';
