-- Migration 140: Add Property Insights fields to property_extended_details
-- Stores data pulled from propertyinsights.co.uk API

ALTER TABLE property_extended_details
  ADD COLUMN IF NOT EXISTS epc_rating CHAR(1),
  ADD COLUMN IF NOT EXISTS epc_efficiency_score SMALLINT,
  ADD COLUMN IF NOT EXISTS epc_potential_rating CHAR(1),
  ADD COLUMN IF NOT EXISTS epc_potential_score SMALLINT,
  ADD COLUMN IF NOT EXISTS epc_property_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS epc_floor_area_sqm NUMERIC(8,1),
  ADD COLUMN IF NOT EXISTS epc_habitable_rooms SMALLINT,
  ADD COLUMN IF NOT EXISTS epc_inspected_date DATE,
  ADD COLUMN IF NOT EXISTS epc_lodgement_date DATE,
  ADD COLUMN IF NOT EXISTS flood_risk_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS flood_risk_river_sea VARCHAR(20),
  ADD COLUMN IF NOT EXISTS flood_risk_surface_water VARCHAR(20),
  ADD COLUMN IF NOT EXISTS broadband_max_download_mbps SMALLINT,
  ADD COLUMN IF NOT EXISTS broadband_max_upload_mbps SMALLINT,
  ADD COLUMN IF NOT EXISTS broadband_superfast BOOLEAN,
  ADD COLUMN IF NOT EXISTS broadband_ultrafast BOOLEAN,
  ADD COLUMN IF NOT EXISTS planning_constraints_count SMALLINT,
  ADD COLUMN IF NOT EXISTS planning_has_conservation_area BOOLEAN,
  ADD COLUMN IF NOT EXISTS planning_has_listed_building BOOLEAN,
  ADD COLUMN IF NOT EXISTS planning_has_article4 BOOLEAN,
  ADD COLUMN IF NOT EXISTS council_tax_authority VARCHAR(100),
  ADD COLUMN IF NOT EXISTS council_tax_band_rates JSONB,
  ADD COLUMN IF NOT EXISTS council_tax_year VARCHAR(10),
  ADD COLUMN IF NOT EXISTS property_insights_last_synced TIMESTAMP WITH TIME ZONE;
