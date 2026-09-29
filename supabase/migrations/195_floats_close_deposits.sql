-- 195: Floats, month close, deposit returns, supplier payment details — and room for markups later.
--
-- 1. FLOATS (as Arthur's "owner float"): a property can have a float target (e.g. £200) kept back from the
--    landlord's money so expenses can still be paid in a month when rent is short. A statement can retain money
--    into the float (up to the target) or use the float to cover expenses. It still balances:
--        rent + float used = management fee + letting fee + expenses + float retained + paid to landlord
--    The float stays in the client account as the landlord's money (it shows in the reconciliation).
-- 2. MONTH CLOSE: once a month's client account is reconciled and signed off, it is closed — no receipts, payments,
--    statements, transfers or adjustments can be dated into it afterwards (a correction goes in an open month).
--    Reopening needs a reason and is recorded.
-- 3. DEPOSIT RETURNS: at the end of a tenancy — deductions (each with a reason), what goes back to the tenant and
--    to the landlord, agreed or disputed (DPS dispute reference), and when it was returned. Numbered DEPR.
-- 4. EXPENSES: when and how the supplier was paid (and the reference); cost_amount = what it actually cost us,
--    for markups later (amount stays what the landlord is charged). Internal only.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

INSERT INTO public.finance_sequences (code, label) VALUES ('DEPR', 'Deposit return') ON CONFLICT (code) DO NOTHING;

-- ── 4. Expenses ──────────────────────────────────────────────────────────────
ALTER TABLE public.recharge_expenses
  ADD COLUMN IF NOT EXISTS cost_amount              NUMERIC(10,2),   -- what it cost us (NULL = same as amount); internal
  ADD COLUMN IF NOT EXISTS paid_to_supplier_on      DATE,
  ADD COLUMN IF NOT EXISTS supplier_payment_method  TEXT,            -- card, bank transfer, cash, direct debit
  ADD COLUMN IF NOT EXISTS supplier_payment_ref     TEXT;

-- ── 1. Floats ────────────────────────────────────────────────────────────────
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS float_target NUMERIC(10,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_float_target_check') THEN
    ALTER TABLE public.properties ADD CONSTRAINT properties_float_target_check CHECK (float_target >= 0);
  END IF;
END $$;
ALTER TABLE public.landlord_statements
  ADD COLUMN IF NOT EXISTS float_retained NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS float_used     NUMERIC(10,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landlord_statements_float_check') THEN
    ALTER TABLE public.landlord_statements ADD CONSTRAINT landlord_statements_float_check CHECK (float_retained >= 0 AND float_used >= 0);
  END IF;
END $$;

-- The float held for a property: everything retained less everything used
CREATE OR REPLACE FUNCTION public.cros_float_balance(p_property UUID) RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(round(sum(float_retained) - sum(float_used), 2), 0) FROM public.landlord_statements WHERE property_id = p_property
$$;
REVOKE ALL ON FUNCTION public.cros_float_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cros_float_balance(UUID) TO authenticated, service_role;

-- Statement lock also freezes the float lines
CREATE OR REPLACE FUNCTION public.cros_statement_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sent_at IS NOT NULL OR OLD.approved_at IS NOT NULL OR OLD.paid_date IS NOT NULL THEN
      RAISE EXCEPTION 'This statement has been approved, sent or paid, so it can''t be deleted. Put any correction on the next statement.';
    END IF;
    RETURN OLD;
  END IF;
  IF ((OLD.sent_at IS NOT NULL AND NEW.sent_at IS NOT NULL) OR (OLD.approved_at IS NOT NULL AND NEW.approved_at IS NOT NULL)) AND (
       NEW.gross_rent IS DISTINCT FROM OLD.gross_rent OR NEW.management_fees IS DISTINCT FROM OLD.management_fees
    OR NEW.letting_fees IS DISTINCT FROM OLD.letting_fees
    OR NEW.property_charges IS DISTINCT FROM OLD.property_charges OR NEW.net_to_landlord IS DISTINCT FROM OLD.net_to_landlord
    OR NEW.float_retained IS DISTINCT FROM OLD.float_retained OR NEW.float_used IS DISTINCT FROM OLD.float_used
    OR NEW.rooms IS DISTINCT FROM OLD.rooms OR NEW.expenses IS DISTINCT FROM OLD.expenses
    OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.landlord_id IS DISTINCT FROM OLD.landlord_id) THEN
    RAISE EXCEPTION 'This statement has been approved, so its figures are locked. Put any correction on the next statement.';
  END IF;
  IF OLD.paid_date IS NOT NULL AND NEW.approved_at IS NULL AND OLD.approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'This statement has been paid, so it can''t be un-approved.';
  END IF;
  RETURN NEW;
END $$;

-- Making a statement now takes the float lines too (same checks as migration 193, plus the float)
CREATE OR REPLACE FUNCTION public.cros_create_statement(p JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prop        UUID := (p->>'property_id')::UUID;
  gross       NUMERIC := round((p->>'gross_rent')::NUMERIC, 2);
  mgmt        NUMERIC := round((p->>'management_fees')::NUMERIC, 2);
  letf        NUMERIC := round(COALESCE((p->>'letting_fees')::NUMERIC, 0), 2);
  exps        NUMERIC := round((p->>'property_charges')::NUMERIC, 2);
  net         NUMERIC := round((p->>'net_to_landlord')::NUMERIC, 2);
  fret        NUMERIC := round(COALESCE((p->>'float_retained')::NUMERIC, 0), 2);
  fuse        NUMERIC := round(COALESCE((p->>'float_used')::NUMERIC, 0), 2);
  c           JSONB;
  ch          RECORD;
  rent_total  NUMERIC := 0;
  exp_total   NUMERIC := 0;
  let_total   NUMERIC := 0;
  n_exp       INT;
  ref         TEXT;
  new_id      UUID;
BEGIN
  IF prop IS NULL THEN RAISE EXCEPTION 'No property given'; END IF;
  IF fret < 0 OR fuse < 0 OR (fret > 0 AND fuse > 0) THEN RAISE EXCEPTION 'A statement either adds to the float or uses it, not both'; END IF;
  IF net < 0 THEN RAISE EXCEPTION 'The statement would leave the landlord owing money'; END IF;
  IF round(gross + fuse - mgmt - letf - exps - fret - net, 2) <> 0 THEN
    RAISE EXCEPTION 'The statement doesn''t balance: rent £% + float used £% less fees £% and £%, expenses £% and float kept £% is not £%', gross, fuse, mgmt, letf, exps, fret, net;
  END IF;
  IF (SELECT round(COALESCE(sum((r->>'rent_income')::NUMERIC), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> gross
     OR (SELECT round(COALESCE(sum((r->>'management_fee')::NUMERIC), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> mgmt
     OR (SELECT round(COALESCE(sum(COALESCE((r->>'letting_fee')::NUMERIC, 0)), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> letf THEN
    RAISE EXCEPTION 'The room lines don''t add up to the statement totals';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cros_float_' || prop::TEXT));
  IF fuse > public.cros_float_balance(prop) THEN RAISE EXCEPTION 'Only £% is in the float', public.cros_float_balance(prop); END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p->'charges', '[]')) LOOP
    SELECT id, property_id, amount_received, COALESCE(remitted_amount, 0) AS remitted, voided INTO ch
      FROM public.rent_charges WHERE id = (c->>'id')::UUID FOR UPDATE;
    IF ch.id IS NULL OR ch.property_id <> prop OR ch.voided THEN RAISE EXCEPTION 'A rent charge on this statement isn''t for this property'; END IF;
    IF round(ch.amount_received, 2) <> round((c->>'remit_to')::NUMERIC, 2) THEN
      RAISE EXCEPTION 'Rent has changed since this statement was prepared — prepare it again';
    END IF;
    IF ch.remitted >= round((c->>'remit_to')::NUMERIC, 2) THEN RAISE EXCEPTION 'Some of this rent is already on another statement — prepare it again'; END IF;
    rent_total := rent_total + round((c->>'remit_to')::NUMERIC, 2) - ch.remitted;
  END LOOP;
  IF round(rent_total, 2) <> gross THEN
    RAISE EXCEPTION 'Rent on the statement (£%) doesn''t match the rent received and not yet paid over (£%)', gross, round(rent_total, 2);
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0) INTO n_exp, exp_total FROM public.recharge_expenses
   WHERE id IN (SELECT (e->>'id')::UUID FROM jsonb_array_elements(COALESCE(p->'expenses', '[]')) e)
     AND property_id = prop AND included_in_statement_id IS NULL AND voided_at IS NULL;
  IF n_exp <> jsonb_array_length(COALESCE(p->'expenses', '[]')) OR round(exp_total, 2) <> exps THEN
    RAISE EXCEPTION 'An expense has changed or is already on a statement — prepare it again';
  END IF;

  SELECT COALESCE(sum(letting_fee_charged), 0) INTO let_total FROM public.tenancies
   WHERE id IN (SELECT (x #>> '{}')::UUID FROM jsonb_array_elements(COALESCE(p->'letting_fee_tenancies', '[]')) x)
     AND property_id = prop AND letting_fee_statement_id IS NULL;
  IF round(let_total, 2) <> letf THEN RAISE EXCEPTION 'A letting fee has changed or is already charged — prepare it again'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cros_ls_number'));
  SELECT 'LS' || lpad((COALESCE(max(substring(statement_reference FROM 3)::INT), 0) + 1)::TEXT, 4, '0') INTO ref
    FROM public.landlord_statements WHERE statement_reference ~ '^LS[0-9]+$';

  INSERT INTO public.landlord_statements (landlord_id, property_id, statement_reference, reference, statement_date, period_start, period_end,
      gross_rent, management_fees, letting_fees, property_charges, net_to_landlord, float_retained, float_used, management_fee_pct, rooms, expenses, source, created_by)
  VALUES ((p->>'landlord_id')::UUID, prop, ref, ref, (p->>'statement_date')::DATE, (p->>'period_start')::DATE, (p->>'period_end')::DATE,
      gross, mgmt, letf, exps, net, fret, fuse, NULLIF(p->>'management_fee_pct', '')::NUMERIC, COALESCE(p->'rooms', '[]'), COALESCE(p->'expenses', '[]'),
      'cros', NULLIF(p->>'created_by', '')::UUID)
  RETURNING id INTO new_id;

  UPDATE public.rent_charges rc SET remitted_amount = round((x.v->>'remit_to')::NUMERIC, 2), remitted_statement_id = new_id
    FROM jsonb_array_elements(COALESCE(p->'charges', '[]')) AS x(v) WHERE rc.id = (x.v->>'id')::UUID;
  UPDATE public.recharge_expenses SET included_in_statement_id = new_id
   WHERE id IN (SELECT (e->>'id')::UUID FROM jsonb_array_elements(COALESCE(p->'expenses', '[]')) e);
  UPDATE public.tenancies SET letting_fee_statement_id = new_id
   WHERE id IN (SELECT (x #>> '{}')::UUID FROM jsonb_array_elements(COALESCE(p->'letting_fee_tenancies', '[]')) x);

  RETURN jsonb_build_object('id', new_id, 'statement_reference', ref);
END $$;
REVOKE ALL ON FUNCTION public.cros_create_statement(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cros_create_statement(JSONB) TO service_role;

-- ── 2. Month close ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_periods (
  month              DATE PRIMARY KEY,                 -- 1st of the month
  status             TEXT NOT NULL CHECK (status IN ('closed', 'reopened')),
  reconciliation_id  UUID REFERENCES public.client_reconciliations(id) ON DELETE RESTRICT,
  closed_at          TIMESTAMPTZ,
  closed_by          UUID REFERENCES public.people(id) ON DELETE SET NULL,
  reopened_at        TIMESTAMPTZ,
  reopened_by        UUID REFERENCES public.people(id) ON DELETE SET NULL,
  reopen_reason      TEXT
);
ALTER TABLE public.finance_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage finance periods" ON public.finance_periods;
CREATE POLICY "admins manage finance periods" ON public.finance_periods FOR ALL TO authenticated USING (public.cros_is_admin()) WITH CHECK (public.cros_is_admin());
REVOKE ALL ON public.finance_periods FROM anon;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'finance_periods_finance_audit') THEN
    CREATE TRIGGER finance_periods_finance_audit AFTER INSERT OR UPDATE OR DELETE ON public.finance_periods FOR EACH ROW EXECUTE FUNCTION public.cros_finance_audit();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'finance_periods_no_delete') THEN
    CREATE TRIGGER finance_periods_no_delete BEFORE DELETE ON public.finance_periods FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cros_month_closed(d DATE) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d IS NOT NULL AND EXISTS (SELECT 1 FROM public.finance_periods WHERE month = date_trunc('month', d)::DATE AND status = 'closed')
$$;

-- Refuse money movements dated into a closed month (the date that matters for each table)
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
  END IF;
  IF moved AND public.cros_month_closed(d) THEN
    RAISE EXCEPTION 'The month of % is closed (reconciled and signed off). Date this in an open month, or reopen the month first.', to_char(d, 'FMMonth YYYY');
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rent_charges', 'landlord_statements', 'office_transfers', 'client_ledger_adjustments', 'bank_transactions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_period_guard') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cros_period_guard()', t || '_period_guard', t);
    END IF;
  END LOOP;
END $$;

-- ── 3. Deposit returns ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deposit_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no            TEXT,
  tenancy_id        UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE RESTRICT,
  deposit_amount    NUMERIC(10,2) NOT NULL CHECK (deposit_amount >= 0),
  deductions        JSONB NOT NULL DEFAULT '[]',        -- [{ description, amount, evidence }]
  to_landlord       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (to_landlord >= 0),
  to_tenant         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (to_tenant >= 0),
  status            TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'agreed', 'disputed', 'returned')),
  scheme            TEXT,
  dispute_ref       TEXT,
  returned_on       DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deposit_returns_adds_up CHECK (round(to_landlord + to_tenant, 2) = round(deposit_amount, 2))
);
CREATE UNIQUE INDEX IF NOT EXISTS deposit_returns_one_per_tenancy ON public.deposit_returns (tenancy_id);
CREATE UNIQUE INDEX IF NOT EXISTS deposit_returns_txn_no_key ON public.deposit_returns (txn_no) WHERE txn_no IS NOT NULL;
ALTER TABLE public.deposit_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages deposit returns" ON public.deposit_returns;
CREATE POLICY "office manages deposit returns" ON public.deposit_returns FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
REVOKE ALL ON public.deposit_returns FROM anon;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'deposit_returns_txn_no_number') THEN
    CREATE TRIGGER deposit_returns_txn_no_number BEFORE INSERT OR UPDATE ON public.deposit_returns FOR EACH ROW EXECUTE FUNCTION public.cros_assign_finance_no('txn_no', 'DEPR', '-');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'deposit_returns_no_delete') THEN
    CREATE TRIGGER deposit_returns_no_delete BEFORE DELETE ON public.deposit_returns FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'deposit_returns_finance_audit') THEN
    CREATE TRIGGER deposit_returns_finance_audit AFTER INSERT OR UPDATE OR DELETE ON public.deposit_returns FOR EACH ROW EXECUTE FUNCTION public.cros_finance_audit();
  END IF;
END $$;
