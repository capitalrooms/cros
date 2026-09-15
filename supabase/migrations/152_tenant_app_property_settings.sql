-- Migration 152: Tenant App property settings
-- Adds per-property configuration for the tenant dashboard.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS heating_schedule JSONB,
  ADD COLUMN IF NOT EXISTS notice_board_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS featured_tasks TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS show_fire_door_guide BOOLEAN NOT NULL DEFAULT false;
