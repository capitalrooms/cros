-- 210 — Practice bank imports: a bank CSV imported in practice mode (migration 209) is flagged, so every line in it
-- takes a practice receipt number (XRCPT…, via cros_is_practice: is_practice = true) and stays out of the real
-- Bank & matching lists, client money and the cash book. The real RCPT series never moves.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.
ALTER TABLE public.bank_import_batches ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.bank_transactions   ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS bank_transactions_practice_idx ON public.bank_transactions (is_practice) WHERE is_practice;
