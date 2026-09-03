-- Migration 117: Add id_photo_url to people table
-- Stores a small passport/ID scan thumbnail accepted during reference import.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS id_photo_url TEXT;
