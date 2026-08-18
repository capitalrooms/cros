-- Migration 035: Add deposit_amount and lease_reference to tenancies
-- These were always needed but missing from the initial schema.

ALTER TABLE public.tenancies
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS lease_reference VARCHAR(50);

-- Index so we can look up by reference quickly
CREATE INDEX IF NOT EXISTS idx_tenancies_lease_reference
  ON public.tenancies (lease_reference);

-- Applied via Supabase Management API (2026-08-17).
