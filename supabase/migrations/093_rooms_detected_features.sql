-- Migration 093: Detected room features (from AI photo scan)
-- Stored as JSONB so we can extend the feature set without further migrations

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS detected_features JSONB DEFAULT NULL;

-- Example shape:
-- {
--   "flooring": "carpet",
--   "natural_light": "good",
--   "window_treatment": "curtains",
--   "wardrobe": "built-in double wardrobe",
--   "window_type": "sash windows",
--   "extras": ["high ceilings", "original fireplace"]
-- }

NOTIFY pgrst, 'reload schema';
