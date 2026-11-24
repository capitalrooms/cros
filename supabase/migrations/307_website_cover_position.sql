-- 307 — where each advice post's cover picture sits in its frame (24 Nov 2026).
-- Stored as "x% y%" (the point of the picture that stays in view). Default: centre.
ALTER TABLE public.website_posts ADD COLUMN IF NOT EXISTS cover_position TEXT NOT NULL DEFAULT '50% 50%';
