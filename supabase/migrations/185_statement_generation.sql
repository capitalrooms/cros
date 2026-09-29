-- Migration 185: generating and sending landlord statements from real rent received.
--
-- rent_charges.remitted_amount — how much of this charge has already gone onto a landlord statement.
--   A statement includes (amount_received − remitted_amount), so rent that arrives late — or in parts —
--   lands on the next statement instead of being missed or counted twice.
-- rent_charges.remitted_statement_id — the statement that last included it.
-- landlord_statements.sent_at / sent_to — when the statement was emailed to the landlord, and to whom.
--
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

ALTER TABLE public.rent_charges        ADD COLUMN IF NOT EXISTS remitted_amount      NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.rent_charges        ADD COLUMN IF NOT EXISTS remitted_statement_id UUID REFERENCES public.landlord_statements(id) ON DELETE SET NULL;
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS sent_at  TIMESTAMPTZ;
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS sent_to  TEXT;

CREATE INDEX IF NOT EXISTS rent_charges_unremitted_idx ON public.rent_charges (property_id) WHERE amount_received > remitted_amount;
