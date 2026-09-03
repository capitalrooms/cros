-- Migration 091: Extra fields for let-only rooms and listings
-- Room floor area + property-level appliances (washer/dryer)

ALTER TABLE public.let_only_rooms
  ADD COLUMN IF NOT EXISTS floor_area_sqm NUMERIC(6,1) DEFAULT NULL;

ALTER TABLE public.let_only_listings
  ADD COLUMN IF NOT EXISTS has_washing_machine BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_tumble_dryer    BOOLEAN DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
