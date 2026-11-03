-- 260: the tenant's receipt for their let-only move-in money (3 Nov 2026) — when it was emailed and to whom.
-- ADDITIVE, idempotent: safe to run more than once.
ALTER TABLE public.initial_monies
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_sent_to text;
