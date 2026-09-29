-- Add EPC columns to properties table
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS epc_rating text,
  ADD COLUMN IF NOT EXISTS epc_expiry date;
