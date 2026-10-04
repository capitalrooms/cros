-- 211 — Landlord expenses can come from Capture (a photo or emailed invoice, migration 208) and from a contractor's
-- invoice approved in CROS, as well as typed in or imported. Migration 169's list of sources didn't allow those two,
-- so filing a bill from Capture or approving a contractor invoice was refused by the database.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.
ALTER TABLE public.recharge_expenses DROP CONSTRAINT IF EXISTS recharge_expenses_source_check;
ALTER TABLE public.recharge_expenses ADD CONSTRAINT recharge_expenses_source_check
  CHECK (source IN ('manual', 'statement_import', 'bank_import', 'supplier_invoice', 'capture'));
