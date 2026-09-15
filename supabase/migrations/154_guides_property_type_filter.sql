-- Migration 154: Guide property-type filtering
-- Adds a property_type filter so guides can be shown to HMO only, single-let only, or both.
-- 'all' = shown regardless of property type (default, keeps existing behaviour)
-- 'hmo' = shown only to HMO tenants
-- 'single_let' = shown only to single-let tenants
-- 'fire_door' = special flag: shown only when property.show_fire_door_guide = true

ALTER TABLE tenant_guides
  ADD COLUMN IF NOT EXISTS property_type_filter TEXT NOT NULL DEFAULT 'all'
    CHECK (property_type_filter IN ('all', 'hmo', 'single_let', 'fire_door'));
