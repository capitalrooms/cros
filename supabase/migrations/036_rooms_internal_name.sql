-- Migration 036: Add internal_name to rooms
-- Tenant-visible name stays in `name` (e.g. "Room 1").
-- Admin-only label goes in `internal_name` (e.g. "former lounge").
-- Nothing tenant-facing references internal_name.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS internal_name VARCHAR(255);

-- Applied via Supabase Management API (2026-08-17).
