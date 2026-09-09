-- Migration 142: Add market data, crime, schools, and environmental risk columns

ALTER TABLE property_extended_details
  ADD COLUMN IF NOT EXISTS crime_data JSONB,
  ADD COLUMN IF NOT EXISTS sold_prices_data JSONB,
  ADD COLUMN IF NOT EXISTS area_prices_data JSONB,
  ADD COLUMN IF NOT EXISTS schools_data JSONB,
  ADD COLUMN IF NOT EXISTS environmental_risk_data JSONB;
