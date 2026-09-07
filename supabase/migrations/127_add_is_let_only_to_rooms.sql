-- Migration 127: Add is_let_only column to rooms table
-- This column was referenced in code but never added to the DB.
-- is_let_only = true means the property is managed externally (let-only);
-- Capital Rooms handles lettings only, not management.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_let_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rooms.is_let_only IS
  'True when the property is let-only (externally managed). Shown as a purple badge in the lettings UI.';
