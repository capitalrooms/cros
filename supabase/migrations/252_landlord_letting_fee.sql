-- Migration 252: a landlord's let-only letting fee (30 Oct 2026). Set once on the client; every let-only house of theirs
-- uses it unless the house has its own. A tenancy can still record the fee actually charged (tenancies.letting_fee_charged).
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS letting_fee_pct  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS letting_fee_flat NUMERIC(10,2);
