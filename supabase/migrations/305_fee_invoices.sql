-- 305 — fee invoices and what's been paid against them (24 Nov 2026).
-- A landlord (or tenant) can be invoiced for a fee — e.g. a let-only letting fee owed when no rent was taken — and each
-- payment they make is recorded against the invoice. Nothing is deleted: an invoice is voided with a reason, and a
-- payment is reversed by a new row, so the trail is complete (the same rules as the other money records).
-- Numbers come from the finance sequence INV (migration 191).

CREATE TABLE IF NOT EXISTS public.fee_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no      TEXT NOT NULL UNIQUE DEFAULT public.next_finance_no('INV'),
  payer_kind      TEXT NOT NULL CHECK (payer_kind IN ('landlord', 'tenant')),
  payer_id        UUID NOT NULL REFERENCES public.people(id),
  property_id     UUID REFERENCES public.properties(id),
  tenancy_id      UUID REFERENCES public.tenancies(id),
  description     TEXT NOT NULL,
  net_amount      NUMERIC(10, 2) NOT NULL CHECK (net_amount >= 0),
  vat_amount      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount    NUMERIC(10, 2) NOT NULL CHECK (total_amount > 0),
  issued_on       DATE NOT NULL,
  due_on          DATE NOT NULL,
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT,
  CONSTRAINT fee_invoice_total_adds_up CHECK (total_amount = net_amount + vat_amount),
  CONSTRAINT fee_invoice_void_reason CHECK (voided_at IS NULL OR coalesce(btrim(void_reason), '') <> '')
);

CREATE TABLE IF NOT EXISTS public.fee_invoice_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES public.fee_invoices(id),
  amount          NUMERIC(10, 2) NOT NULL CHECK (amount <> 0),   -- negative = a reversal of an earlier payment
  paid_on         DATE NOT NULL,
  method          TEXT,
  bank_reference  TEXT,
  bank_transaction_id UUID REFERENCES public.bank_transactions(id),
  note            TEXT,
  reverses_id     UUID REFERENCES public.fee_invoice_payments(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT
);

CREATE INDEX IF NOT EXISTS fee_invoice_payments_invoice_idx ON public.fee_invoice_payments (invoice_id);
CREATE INDEX IF NOT EXISTS fee_invoices_due_idx ON public.fee_invoices (due_on) WHERE voided_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fee_invoices_no_delete') THEN
    CREATE TRIGGER fee_invoices_no_delete BEFORE DELETE ON public.fee_invoices FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fee_invoice_payments_no_delete') THEN
    CREATE TRIGGER fee_invoice_payments_no_delete BEFORE DELETE ON public.fee_invoice_payments FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
END $$;

ALTER TABLE public.fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoice_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads and writes fee invoices" ON public.fee_invoices;
CREATE POLICY "office reads and writes fee invoices" ON public.fee_invoices FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
DROP POLICY IF EXISTS "office reads and writes fee invoice payments" ON public.fee_invoice_payments;
CREATE POLICY "office reads and writes fee invoice payments" ON public.fee_invoice_payments FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
