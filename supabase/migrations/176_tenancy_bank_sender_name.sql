-- Migration 176: Add bank_sender_name to tenancies
-- When a tenant pays with the correct reference, we save their bank display name.
-- This lets us match future payments where they forget the reference.

ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS bank_sender_name TEXT;

COMMENT ON COLUMN tenancies.bank_sender_name IS
  'Bank account display name extracted from CSV description on first exact-reference match. Used as secondary identifier for fuzzy matching.';
