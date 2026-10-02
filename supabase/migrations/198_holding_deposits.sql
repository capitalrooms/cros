-- 198 — Holding deposits: an official, numbered record of every holding deposit received.
--
-- Each one gets a HOLD number (HOLD000001…), the amount, the date it actually reached us, how it was paid and the
-- payer's reference, and who recorded it and when. It is client money, so it follows the finance rules (191/195):
--   • never deleted (cros_no_delete) and every change logged (cros_finance_audit);
--   • the receipt itself can't be edited — amount, date received, method, payer and number are fixed. A mistake is
--     put right by reversing the record (with a reason) and recording it again, so both stay on file;
--   • once it leaves "held" (applied to the deposit or first rent, refunded, retained, or reversed) that outcome is
--     final too;
--   • nothing can be dated into a month that has been closed (cros_period_guard).
-- The applicant/offer is known from the start; the tenancy and the person are linked once the tenancy exists.

INSERT INTO public.finance_sequences (code, label) VALUES ('HOLD', 'Holding deposit') ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.holding_deposits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_no              TEXT,
  applicant_id         UUID REFERENCES public.applicants(id) ON DELETE RESTRICT,
  offer_id             UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  tenancy_id           UUID REFERENCES public.tenancies(id) ON DELETE SET NULL,
  person_id            UUID REFERENCES public.people(id) ON DELETE SET NULL,
  property_id          UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id              UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  payer_name           TEXT NOT NULL,
  amount               NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  received_on          DATE NOT NULL,                       -- the day the money reached us
  method               TEXT NOT NULL CHECK (method IN ('bank_transfer', 'card', 'cash', 'other')),
  payer_reference      TEXT,                                -- the reference on the payment
  bank_transaction_id  UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  apply_to             TEXT NOT NULL DEFAULT 'deposit' CHECK (apply_to IN ('deposit', 'first_rent')),
  status               TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'applied', 'refunded', 'retained', 'reversed')),
  outcome_on           DATE,
  outcome_reason       TEXT,
  outcome_by           TEXT,
  outcome_at           TIMESTAMPTZ,
  notes                TEXT,
  receipt_document_id  UUID REFERENCES public.generated_documents(id) ON DELETE SET NULL,
  receipt_emailed_at   TIMESTAMPTZ,
  receipt_emailed_to   TEXT[],
  recorded_by          TEXT NOT NULL,                       -- staff email
  recorded_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT holding_deposits_outcome_complete CHECK (status = 'held' OR (outcome_on IS NOT NULL AND outcome_at IS NOT NULL)),
  CONSTRAINT holding_deposits_reason_needed CHECK (status NOT IN ('reversed', 'retained', 'refunded') OR coalesce(btrim(outcome_reason), '') <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS holding_deposits_hold_no_key ON public.holding_deposits (hold_no) WHERE hold_no IS NOT NULL;
-- one live holding deposit per applicant (stops a double click recording it twice)
CREATE UNIQUE INDEX IF NOT EXISTS holding_deposits_one_held ON public.holding_deposits (applicant_id) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS holding_deposits_tenancy_idx ON public.holding_deposits (tenancy_id);
CREATE INDEX IF NOT EXISTS holding_deposits_received_idx ON public.holding_deposits (received_on);

-- The receipt and its outcome can't be rewritten
CREATE OR REPLACE FUNCTION public.cros_holding_deposit_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hold_no IS DISTINCT FROM OLD.hold_no OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.received_on IS DISTINCT FROM OLD.received_on OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.payer_name IS DISTINCT FROM OLD.payer_name OR NEW.payer_reference IS DISTINCT FROM OLD.payer_reference
     OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'A holding deposit receipt can''t be changed once recorded. Reverse it (with a reason) and record it again.';
  END IF;
  IF OLD.status <> 'held' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.outcome_on IS DISTINCT FROM OLD.outcome_on
     OR NEW.outcome_reason IS DISTINCT FROM OLD.outcome_reason OR NEW.outcome_by IS DISTINCT FROM OLD.outcome_by
     OR NEW.outcome_at IS DISTINCT FROM OLD.outcome_at OR NEW.apply_to IS DISTINCT FROM OLD.apply_to) THEN
    RAISE EXCEPTION 'This holding deposit is already %; that can''t be changed.', OLD.status;
  END IF;
  IF NEW.outcome_on IS NOT NULL AND NEW.outcome_on < NEW.received_on THEN
    RAISE EXCEPTION 'The outcome date can''t be before the day the holding deposit was received.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Closed months: a receipt dated into one, or an outcome dated into one, is refused
CREATE OR REPLACE FUNCTION public.cros_period_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d DATE; old_d DATE; moved BOOLEAN := TRUE;
BEGIN
  IF TG_TABLE_NAME = 'rent_charges' THEN
    -- money received into a closed month (a changed amount or a receipt dated there)
    d := NEW.received_date;
    IF TG_OP = 'UPDATE' THEN moved := NEW.amount_received IS DISTINCT FROM OLD.amount_received OR NEW.received_date IS DISTINCT FROM OLD.received_date; END IF;
  ELSIF TG_TABLE_NAME = 'landlord_statements' THEN
    IF TG_OP = 'INSERT' THEN d := NEW.statement_date;
    ELSE
      moved := NEW.paid_date IS DISTINCT FROM OLD.paid_date OR NEW.statement_date IS DISTINCT FROM OLD.statement_date;
      d := CASE WHEN NEW.paid_date IS DISTINCT FROM OLD.paid_date THEN COALESCE(NEW.paid_date, OLD.paid_date) ELSE NEW.statement_date END;
      IF moved AND NEW.statement_date IS DISTINCT FROM OLD.statement_date AND public.cros_month_closed(OLD.statement_date) THEN
        RAISE EXCEPTION 'The month of % is closed', to_char(OLD.statement_date, 'FMMonth YYYY');
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'office_transfers' THEN
    d := NEW.transferred_on; IF TG_OP = 'UPDATE' THEN moved := NEW.transferred_on IS DISTINCT FROM OLD.transferred_on OR NEW.voided_at IS DISTINCT FROM OLD.voided_at OR NEW.amount IS DISTINCT FROM OLD.amount; END IF;
  ELSIF TG_TABLE_NAME = 'client_ledger_adjustments' THEN
    d := NEW.entry_date; IF TG_OP = 'UPDATE' THEN moved := NEW.entry_date IS DISTINCT FROM OLD.entry_date OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.voided_at IS DISTINCT FROM OLD.voided_at; END IF;
  ELSIF TG_TABLE_NAME = 'bank_transactions' THEN
    d := NEW.transaction_date; IF TG_OP = 'UPDATE' THEN moved := NEW.transaction_date IS DISTINCT FROM OLD.transaction_date OR NEW.amount IS DISTINCT FROM OLD.amount; END IF;
  ELSIF TG_TABLE_NAME = 'holding_deposits' THEN
    IF TG_OP = 'INSERT' THEN d := NEW.received_on;
    ELSE moved := NEW.status IS DISTINCT FROM OLD.status; d := NEW.outcome_on;
    END IF;
  END IF;
  IF moved AND public.cros_month_closed(d) THEN
    RAISE EXCEPTION 'The month of % is closed (reconciled and signed off). Date this in an open month, or reopen the month first.', to_char(d, 'FMMonth YYYY');
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'holding_deposits_hold_no_number') THEN
    CREATE TRIGGER holding_deposits_hold_no_number BEFORE INSERT OR UPDATE ON public.holding_deposits FOR EACH ROW EXECUTE FUNCTION public.cros_assign_finance_no('hold_no', 'HOLD', '-');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'holding_deposits_fixed') THEN
    CREATE TRIGGER holding_deposits_fixed BEFORE UPDATE ON public.holding_deposits FOR EACH ROW EXECUTE FUNCTION public.cros_holding_deposit_fixed();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'holding_deposits_period_guard') THEN
    CREATE TRIGGER holding_deposits_period_guard BEFORE INSERT OR UPDATE ON public.holding_deposits FOR EACH ROW EXECUTE FUNCTION public.cros_period_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'holding_deposits_no_delete') THEN
    CREATE TRIGGER holding_deposits_no_delete BEFORE DELETE ON public.holding_deposits FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'holding_deposits_finance_audit') THEN
    CREATE TRIGGER holding_deposits_finance_audit AFTER INSERT OR UPDATE OR DELETE ON public.holding_deposits FOR EACH ROW EXECUTE FUNCTION public.cros_finance_audit();
  END IF;
END $$;

-- Office only (lettings staff record them); nobody else reads them
ALTER TABLE public.holding_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages holding deposits" ON public.holding_deposits;
CREATE POLICY "office manages holding deposits" ON public.holding_deposits FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
REVOKE ALL ON public.holding_deposits FROM anon;

-- Receipts are filed with Letters & Invoices
ALTER TABLE public.generated_documents DROP CONSTRAINT IF EXISTS generated_documents_kind_check;
ALTER TABLE public.generated_documents ADD CONSTRAINT generated_documents_kind_check CHECK (kind IN ('invoice', 'letter', 'receipt'));
