-- Migration 143: Add house_info JSONB to properties
-- Stores static reference facts shown to tenants (wifi, bin day, etc.)

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS house_info JSONB;
