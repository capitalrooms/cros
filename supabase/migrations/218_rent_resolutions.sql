-- 218 — Sorting out rent that didn't arrive as it should (Harry, 12 Oct 2026: "it needs to be full proof and allow
-- resolutions for when things don't always run to plan"). With the "Sort out" panel on the Rent Roll, Arrears and the
-- letting file (lib/rent/resolve.ts):
--   • rent_arrangements — an agreed payment plan for a tenant's arrears (e.g. £50 a month from 1 Nov)
--   • payment_audit_log may now also record: the tenant being told what's due, a whole bank payment reversed,
--     an overpayment refunded, rent paid straight to the landlord, and a payment plan agreed or ended
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.rent_arrangements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id    UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  arrears       NUMERIC(10,2) NOT NULL,          -- what was owed when it was agreed
  instalment    NUMERIC(10,2) NOT NULL,          -- extra paid each month on top of the rent
  starts_on     DATE NOT NULL,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'broken', 'cancelled')),
  ended_at      TIMESTAMPTZ,
  ended_note    TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rent_arrangements_tenancy_idx ON public.rent_arrangements (tenancy_id) WHERE status = 'active';
ALTER TABLE public.rent_arrangements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages rent arrangements" ON public.rent_arrangements;
CREATE POLICY "office manages rent arrangements" ON public.rent_arrangements FOR ALL TO authenticated
  USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
REVOKE ALL ON public.rent_arrangements FROM anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_audit_log') THEN
    ALTER TABLE public.payment_audit_log DROP CONSTRAINT IF EXISTS payment_audit_log_action_check;
    ALTER TABLE public.payment_audit_log ADD CONSTRAINT payment_audit_log_action_check CHECK (action IN (
      'created', 'amount_due_edited', 'manually_paid', 'csv_matched', 'voided', 'status_changed',
      'amount_received_adjusted', 'promoted_overdue', 'manual_allocated', 'fuzzy_confirmed',
      'tenant_told', 'payment_reversed', 'refunded', 'paid_direct', 'arrangement'));
  END IF;
END $$;
