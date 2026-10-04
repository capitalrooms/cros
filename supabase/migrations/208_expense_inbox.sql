-- 208 — One safe way in for every expense, and invoices by email.
-- 1. recharge_expenses.source / source_ref: where a landlord expense came from ('manual', 'supplier_invoice',
--    'capture') and a key that is unique across the table — so one document can never become two expenses,
--    whichever screen (or double click) tries.
-- 2. capture_items: can arrive by email (invoices@inbound.capitalrooms.co.uk); keeps the sender, subject and the
--    AI's reading of the bill; 'filing' is the moment between claiming an item and filing it (stops doubles); the
--    same file can't be waiting twice.
-- 3. company_documents become the company's own expenses when they carry an amount: CEX000001 numbering (finance
--    sequence), category, supplier, date paid; voided with a reason, never deleted.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

-- ── 1. landlord expenses: where from, and never twice ────────────────────────
ALTER TABLE public.recharge_expenses ADD COLUMN IF NOT EXISTS source     TEXT;
ALTER TABLE public.recharge_expenses ADD COLUMN IF NOT EXISTS source_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS recharge_expenses_source_ref_key ON public.recharge_expenses (source_ref) WHERE source_ref IS NOT NULL;

-- ── 2. capture inbox: email in, claimed while filing ─────────────────────────
ALTER TABLE public.capture_items DROP CONSTRAINT IF EXISTS capture_items_source_check;
ALTER TABLE public.capture_items ADD CONSTRAINT capture_items_source_check CHECK (source IN ('phone', 'shortcut', 'desktop', 'email'));
ALTER TABLE public.capture_items DROP CONSTRAINT IF EXISTS capture_items_status_check;
ALTER TABLE public.capture_items ADD CONSTRAINT capture_items_status_check CHECK (status IN ('new', 'filing', 'filed', 'discarded'));
ALTER TABLE public.capture_items ADD COLUMN IF NOT EXISTS email_from    TEXT;
ALTER TABLE public.capture_items ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE public.capture_items ADD COLUMN IF NOT EXISTS email_id      TEXT;
ALTER TABLE public.capture_items ADD COLUMN IF NOT EXISTS file_hash     TEXT;
ALTER TABLE public.capture_items ADD COLUMN IF NOT EXISTS bill          JSONB;   -- the AI's reading: supplier, amount, dates, suggestion
CREATE UNIQUE INDEX IF NOT EXISTS capture_items_waiting_hash_key ON public.capture_items (file_hash) WHERE file_hash IS NOT NULL AND status IN ('new', 'filing');

-- ── 3. company expenses (company_documents with an amount) ───────────────────
INSERT INTO public.finance_sequences (code, label) VALUES ('CEX', 'Company expense') ON CONFLICT (code) DO NOTHING;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS amount           NUMERIC(12,2) CHECK (amount IS NULL OR amount > 0);
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS supplier         TEXT;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS invoice_number   TEXT;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS expense_date     DATE;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS expense_category TEXT;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS paid_on          DATE;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS cex_no           TEXT;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS capture_item_id  UUID REFERENCES public.capture_items(id) ON DELETE SET NULL;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS voided_at        TIMESTAMPTZ;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS voided_by        UUID REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS void_reason      TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS company_documents_cex_no_key ON public.company_documents (cex_no) WHERE cex_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS company_documents_capture_item_key ON public.company_documents (capture_item_id) WHERE capture_item_id IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'company_documents_cex_no_number') THEN
    CREATE TRIGGER company_documents_cex_no_number BEFORE INSERT OR UPDATE ON public.company_documents
      FOR EACH ROW EXECUTE FUNCTION public.cros_assign_finance_no('cex_no', 'CEX', 'amount');
  END IF;
END $$;

-- a numbered company expense is kept for the accountant: void it with a reason, never delete it or change the amount
CREATE OR REPLACE FUNCTION public.cros_company_expense_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.cex_no IS NOT NULL THEN RAISE EXCEPTION 'Company expense % can’t be deleted — void it with a reason', OLD.cex_no; END IF;
    RETURN OLD;
  END IF;
  IF OLD.cex_no IS NOT NULL AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.cex_no IS DISTINCT FROM OLD.cex_no) THEN
    RAISE EXCEPTION 'Company expense % can’t be changed — void it and add it again', OLD.cex_no;
  END IF;
  IF NEW.voided_at IS NOT NULL AND coalesce(trim(NEW.void_reason), '') = '' THEN RAISE EXCEPTION 'Say why it’s being voided'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_documents_guard ON public.company_documents;
CREATE TRIGGER company_documents_guard BEFORE UPDATE OR DELETE ON public.company_documents FOR EACH ROW EXECUTE FUNCTION public.cros_company_expense_guard();
