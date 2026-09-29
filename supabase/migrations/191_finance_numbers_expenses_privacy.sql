-- 191: Transaction numbers, expense invoices, deposit certificates, the April 2026 opening position, and a
--      report of who can read what (for the privacy lock-down in 192).
--
-- 1. TRANSACTION NUMBERS — every money record gets a number from its own never-ending sequence, as accounting
--    systems do (HMRC expects unique, sequential numbers with any gap explained). The number is for the business
--    as a whole, not per property; the record carries its property/tenancy/landlord, and screens show both,
--    e.g. "MGMT000123 · 208ROS". Numbers are given by the database itself (a trigger), so every way a record is
--    created gets one, two people can never get the same number, and a number never changes once given.
--      RENT  rent charge (rent due)                 rent_charges.txn_no
--      RCPT  money received into the client account bank_transactions.txn_no
--      MGMT  management fee (per statement)          landlord_statements.fee_no
--      PAY   payment to the landlord                 landlord_statements.payout_no
--      LETF  letting fee                             tenancies.letting_fee_no
--      DEP   tenancy deposit                         tenancies.deposit_no
--      EXP   landlord expense                        recharge_expenses.txn_no
--      ADJ   client ledger adjustment                client_ledger_adjustments.txn_no
--      (LS   landlord statement — the existing LS0001 sequence, unchanged)
--      Reserved for what comes next: REF (refund to a tenant), WO (write-off), INV (invoice to a landlord).
-- 2. NOTHING FINANCIAL IS DELETED — expenses, rent charges, bank receipts and ledger adjustments can't be deleted;
--    a mistake is voided (kept, with who/when/why) so every number has a record behind it.
-- 3. EXPENSES — category, supplier, invoice number, the invoice file (private bucket finance-docs), whether to send
--    it with the landlord's statement, which statement it comes off, the room, and void fields.
-- 4. OPENING POSITION — CROS's records start on 1 April 2026: earlier rent is treated as paid, and deposits on
--    tenancies that began before then as protected with the DPS (marked "assumed" until the certificate is filed).
-- 5. cros_policy_report() — lists every table's row-level security and policies, for the service key only.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

-- ── 1. Numbering ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_sequences (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  next_value  BIGINT NOT NULL DEFAULT 1 CHECK (next_value > 0),
  width       INT NOT NULL DEFAULT 6
);
ALTER TABLE public.finance_sequences ENABLE ROW LEVEL SECURITY;   -- no policies: service key / database only
INSERT INTO public.finance_sequences (code, label) VALUES
  ('RENT', 'Rent charge'), ('RCPT', 'Money received'), ('MGMT', 'Management fee'), ('PAY', 'Payment to landlord'),
  ('LETF', 'Letting fee'), ('DEP', 'Tenancy deposit'), ('EXP', 'Landlord expense'), ('ADJ', 'Ledger adjustment'),
  ('REF', 'Refund to tenant'), ('WO', 'Write-off'), ('INV', 'Invoice to landlord')
ON CONFLICT (code) DO NOTHING;

-- The next number for a code. The row lock makes it safe when two things are saved at once.
CREATE OR REPLACE FUNCTION public.next_finance_no(p_code TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v BIGINT; w INT;
BEGIN
  UPDATE public.finance_sequences SET next_value = next_value + 1 WHERE code = p_code
  RETURNING next_value - 1, width INTO v, w;
  IF v IS NULL THEN RAISE EXCEPTION 'Unknown transaction code %', p_code; END IF;
  RETURN p_code || lpad(v::TEXT, w, '0');
END $$;
REVOKE ALL ON FUNCTION public.next_finance_no(TEXT) FROM PUBLIC, anon, authenticated;

-- Trigger: give NEW.<col> the next <code> number when it has none and (optionally) NEW.<amount col> > 0.
CREATE OR REPLACE FUNCTION public.cros_assign_finance_no() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE col TEXT := TG_ARGV[0]; code TEXT := TG_ARGV[1]; amt TEXT := NULLIF(TG_ARGV[2], '-'); j JSONB := to_jsonb(NEW);
BEGIN
  IF j->>col IS NULL AND (amt IS NULL OR COALESCE(NULLIF(j->>amt, '')::NUMERIC, 0) > 0) THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(col, public.next_finance_no(code)));
  END IF;
  RETURN NEW;
END $$;

-- Add the column, number existing rows oldest first, keep numbers unique, and number every new/updated row.
CREATE OR REPLACE FUNCTION pg_temp.cros_number(tbl TEXT, col TEXT, code TEXT, amt TEXT, order_by TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I TEXT', tbl, col);
  FOR r IN EXECUTE format('SELECT id FROM public.%I WHERE %I IS NULL %s ORDER BY %s', tbl, col,
                          CASE WHEN amt = '-' THEN '' ELSE format('AND COALESCE(%I, 0) > 0', amt) END, order_by) LOOP
    EXECUTE format('UPDATE public.%I SET %I = public.next_finance_no(%L) WHERE id = %L', tbl, col, code, r.id);
  END LOOP;
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (%I) WHERE %I IS NOT NULL', tbl || '_' || col || '_key', tbl, col, col);
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = tbl || '_' || col || '_number') THEN
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cros_assign_finance_no(%L, %L, %L)',
                   tbl || '_' || col || '_number', tbl, col, code, amt);
  END IF;
END $$;

SELECT pg_temp.cros_number('rent_charges',              'txn_no',         'RENT', '-',                    'charge_month, created_at, id');
SELECT pg_temp.cros_number('bank_transactions',         'txn_no',         'RCPT', '-',                    'transaction_date, imported_at, id');
SELECT pg_temp.cros_number('landlord_statements',       'fee_no',         'MGMT', 'management_fees',      'statement_date, created_at, id');
SELECT pg_temp.cros_number('landlord_statements',       'payout_no',      'PAY',  'amount_paid',          'COALESCE(paid_date, statement_date), created_at, id');
SELECT pg_temp.cros_number('tenancies',                 'letting_fee_no', 'LETF', 'letting_fee_charged',  'start_date, created_at, id');
SELECT pg_temp.cros_number('tenancies',                 'deposit_no',     'DEP',  'deposit_amount',       'start_date, created_at, id');
SELECT pg_temp.cros_number('recharge_expenses',         'txn_no',         'EXP',  '-',                    'expense_date, created_at, id');
SELECT pg_temp.cros_number('client_ledger_adjustments', 'txn_no',         'ADJ',  '-',                    'entry_date, created_at, id');

-- ── 2. No deleting money records — void instead ──────────────────────────────
CREATE OR REPLACE FUNCTION public.cros_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial records can''t be deleted — void it instead, so the record and its number are kept.';
END $$;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rent_charges', 'bank_transactions', 'recharge_expenses', 'client_ledger_adjustments'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_no_delete') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete()', t || '_no_delete', t);
    END IF;
  END LOOP;
END $$;

-- ── 3. Expenses ───────────────────────────────────────────────────────────────
ALTER TABLE public.recharge_expenses
  ADD COLUMN IF NOT EXISTS category        TEXT,
  ADD COLUMN IF NOT EXISTS supplier        TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_path    TEXT,              -- finance-docs bucket (private)
  ADD COLUMN IF NOT EXISTS invoice_name    TEXT,
  ADD COLUMN IF NOT EXISTS share_invoice   BOOLEAN NOT NULL DEFAULT FALSE,   -- attach it to the landlord's statement email
  ADD COLUMN IF NOT EXISTS deduct_month    DATE,              -- a chosen statement month; NULL = the next one still open
  ADD COLUMN IF NOT EXISTS room_id         UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by       UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason     TEXT;
CREATE INDEX IF NOT EXISTS idx_recharge_expenses_open ON public.recharge_expenses (property_id) WHERE included_in_statement_id IS NULL AND voided_at IS NULL;

INSERT INTO storage.buckets (id, name, public) VALUES ('finance-docs', 'finance-docs', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- ── 4. Opening position (1 April 2026) ────────────────────────────────────────
INSERT INTO public.system_settings (key, value) VALUES ('records_start', '2026-04-01') ON CONFLICT (key) DO NOTHING;
ALTER TABLE public.tenancies ADD COLUMN IF NOT EXISTS deposit_protection_assumed BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE public.tenancies
   SET deposit_scheme = COALESCE(deposit_scheme, 'DPS'), deposit_protection_assumed = TRUE
 WHERE start_date < '2026-04-01' AND COALESCE(deposit_amount, 0) > 0
   AND deposit_protected_at IS NULL AND deposit_scheme_ref IS NULL AND deposit_protection_assumed = FALSE;

-- ── 5. Access report (service key only) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cros_policy_report()
RETURNS TABLE (table_name TEXT, rls_enabled BOOLEAN, anon_select BOOLEAN, authed_select BOOLEAN, policy_name TEXT, roles TEXT, command TEXT, using_expr TEXT, check_expr TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.relname::TEXT, c.relrowsecurity,
         has_table_privilege('anon', c.oid, 'SELECT'), has_table_privilege('authenticated', c.oid, 'SELECT'),
         p.policyname::TEXT, array_to_string(p.roles, ','), p.cmd::TEXT, p.qual::TEXT, p.with_check::TEXT
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
   WHERE c.relkind = 'r'
   ORDER BY c.relname, p.policyname
$$;
REVOKE ALL ON FUNCTION public.cros_policy_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cros_policy_report() TO service_role;
