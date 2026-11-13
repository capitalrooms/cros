-- 286 — the picture on a Publish piece (13 Nov 2026): 'figures:dark|light|gold', 'scene:<style>-<season>',
-- 'illus:<key>' or 'photo:<property_photos id>'. Empty = the figures graphic.
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS image text;
