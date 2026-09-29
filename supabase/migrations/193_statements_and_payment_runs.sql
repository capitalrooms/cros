-- 193: Statements made in one step, approved and locked; payment runs; transfers to the office account.
--
-- The monthly cycle, as client-accounting systems run it (Arthur, Alto, Reapit, PayProp, Expert Agent):
--   1. rent receipts are matched to tenancies (bank import — already built)
--   2. a statement per property takes the rent received and not yet paid over, less our fees and the expenses
--      due, and must balance: rent = paid to landlord + management fees + letting fees + expenses
--   3. the statement is approved — its figures are then locked
--   4. a payment run pays landlords (one payment per landlord), and moves our fees and the expenses we paid
--      out back to the office account — each transfer numbered (TRF); the run (RUN) closes when all is ticked
--   5. rent arriving later goes on a follow-on statement (next LS number) — nothing is paid twice
--
-- cros_create_statement() does step 2 inside one database transaction: it re-checks every figure against the
-- records, numbers the statement, and marks the rent, expenses and letting fees as used — all or nothing.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

INSERT INTO public.finance_sequences (code, label) VALUES ('RUN', 'Payment run'), ('TRF', 'Transfer to the office account')
ON CONFLICT (code) DO NOTHING;

-- ── Statements ───────────────────────────────────────────────────────────────
ALTER TABLE public.landlord_statements
  ADD COLUMN IF NOT EXISTS letting_fees   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_run_id UUID,
  ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'import',   -- 'import' (10ninety / typed in) or 'cros'
  ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES public.people(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS landlord_statements_ls_number_key ON public.landlord_statements (statement_reference)
  WHERE statement_reference ~ '^LS[0-9]+$';

-- A letting fee is charged once, on the statement that takes it
ALTER TABLE public.tenancies ADD COLUMN IF NOT EXISTS letting_fee_statement_id UUID REFERENCES public.landlord_statements(id) ON DELETE SET NULL;

-- Figures lock once a statement is approved or sent; nothing approved, sent or paid can be deleted
CREATE OR REPLACE FUNCTION public.cros_statement_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sent_at IS NOT NULL OR OLD.approved_at IS NOT NULL OR OLD.paid_date IS NOT NULL THEN
      RAISE EXCEPTION 'This statement has been approved, sent or paid, so it can''t be deleted. Put any correction on the next statement.';
    END IF;
    RETURN OLD;
  END IF;
  -- locked = was approved or sent, and still is (clearing approved_at/sent_at in the same update is a deliberate,
  -- audited unlock; the API only allows it before payment)
  IF ((OLD.sent_at IS NOT NULL AND NEW.sent_at IS NOT NULL) OR (OLD.approved_at IS NOT NULL AND NEW.approved_at IS NOT NULL)) AND (
       NEW.gross_rent IS DISTINCT FROM OLD.gross_rent OR NEW.management_fees IS DISTINCT FROM OLD.management_fees
    OR NEW.letting_fees IS DISTINCT FROM OLD.letting_fees
    OR NEW.property_charges IS DISTINCT FROM OLD.property_charges OR NEW.net_to_landlord IS DISTINCT FROM OLD.net_to_landlord
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

-- ── Payment runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_no        TEXT,
  period_month  DATE NOT NULL,                        -- the month being paid out (1st of the month)
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES public.people(id) ON DELETE SET NULL,
  closed_at     TIMESTAMPTZ,
  closed_by     UUID REFERENCES public.people(id) ON DELETE SET NULL
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landlord_statements_payment_run_fk') THEN
    ALTER TABLE public.landlord_statements ADD CONSTRAINT landlord_statements_payment_run_fk
      FOREIGN KEY (payment_run_id) REFERENCES public.payment_runs(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Money moved from the client account to the office account in a run: our fees, and expenses we paid out
CREATE TABLE IF NOT EXISTS public.office_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no          TEXT,
  payment_run_id  UUID NOT NULL REFERENCES public.payment_runs(id) ON DELETE RESTRICT,
  kind            TEXT NOT NULL CHECK (kind IN ('fees', 'expenses')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  transferred_on  DATE NOT NULL,
  reference       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.people(id) ON DELETE SET NULL,
  voided_at       TIMESTAMPTZ,
  voided_by       UUID REFERENCES public.people(id) ON DELETE SET NULL,
  void_reason     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS office_transfers_one_per_kind ON public.office_transfers (payment_run_id, kind) WHERE voided_at IS NULL;

-- numbers (RUN000001, TRF000001) — same machinery as migration 191
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS payment_runs_run_no_key ON public.payment_runs (run_no) WHERE run_no IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS office_transfers_txn_no_key ON public.office_transfers (txn_no) WHERE txn_no IS NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payment_runs_run_no_number') THEN
    CREATE TRIGGER payment_runs_run_no_number BEFORE INSERT OR UPDATE ON public.payment_runs FOR EACH ROW EXECUTE FUNCTION public.cros_assign_finance_no('run_no', 'RUN', '-');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'office_transfers_txn_no_number') THEN
    CREATE TRIGGER office_transfers_txn_no_number BEFORE INSERT OR UPDATE ON public.office_transfers FOR EACH ROW EXECUTE FUNCTION public.cros_assign_finance_no('txn_no', 'TRF', 'amount');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'office_transfers_no_delete') THEN
    CREATE TRIGGER office_transfers_no_delete BEFORE DELETE ON public.office_transfers FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payment_runs_no_delete') THEN
    CREATE TRIGGER payment_runs_no_delete BEFORE DELETE ON public.payment_runs FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
  -- every change recorded in finance_audit_log (migration 189)
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payment_runs_finance_audit') THEN
    CREATE TRIGGER payment_runs_finance_audit AFTER INSERT OR UPDATE OR DELETE ON public.payment_runs FOR EACH ROW EXECUTE FUNCTION public.cros_finance_audit();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'office_transfers_finance_audit') THEN
    CREATE TRIGGER office_transfers_finance_audit AFTER INSERT OR UPDATE OR DELETE ON public.office_transfers FOR EACH ROW EXECUTE FUNCTION public.cros_finance_audit();
  END IF;
END $$;

-- Office money: administrators only (as landlord bank details, migration 192)
ALTER TABLE public.payment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage payment runs" ON public.payment_runs;
CREATE POLICY "admins manage payment runs" ON public.payment_runs FOR ALL TO authenticated USING (public.cros_is_admin()) WITH CHECK (public.cros_is_admin());
DROP POLICY IF EXISTS "admins manage office transfers" ON public.office_transfers;
CREATE POLICY "admins manage office transfers" ON public.office_transfers FOR ALL TO authenticated USING (public.cros_is_admin()) WITH CHECK (public.cros_is_admin());
REVOKE ALL ON public.payment_runs, public.office_transfers FROM anon;

-- ── Make a statement: one transaction, every figure re-checked ───────────────
-- p: { property_id, landlord_id, period_start, period_end, statement_date, management_fee_pct, created_by,
--      rooms: [{ room_number, tenant_name, rent_income, management_fee, letting_fee, note }],
--      expenses: [{ id, description, amount, category }],
--      charges: [{ id, remit_to }]          -- rent_charges: pay over up to remit_to (= amount_received when drafted)
--      letting_fee_tenancies: [uuid],       -- tenancies whose letting fee this statement takes
--      gross_rent, management_fees, letting_fees, property_charges, net_to_landlord }
CREATE OR REPLACE FUNCTION public.cros_create_statement(p JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prop        UUID := (p->>'property_id')::UUID;
  gross       NUMERIC := round((p->>'gross_rent')::NUMERIC, 2);
  mgmt        NUMERIC := round((p->>'management_fees')::NUMERIC, 2);
  letf        NUMERIC := round(COALESCE((p->>'letting_fees')::NUMERIC, 0), 2);
  exps        NUMERIC := round((p->>'property_charges')::NUMERIC, 2);
  net         NUMERIC := round((p->>'net_to_landlord')::NUMERIC, 2);
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
  IF round(gross - mgmt - letf - exps - net, 2) <> 0 THEN
    RAISE EXCEPTION 'The statement doesn''t balance: rent £% less fees £% and £% and expenses £% is not £%', gross, mgmt, letf, exps, net;
  END IF;
  IF (SELECT round(COALESCE(sum((r->>'rent_income')::NUMERIC), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> gross
     OR (SELECT round(COALESCE(sum((r->>'management_fee')::NUMERIC), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> mgmt
     OR (SELECT round(COALESCE(sum(COALESCE((r->>'letting_fee')::NUMERIC, 0)), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> letf THEN
    RAISE EXCEPTION 'The room lines don''t add up to the statement totals';
  END IF;

  -- rent: each charge must still have exactly the money we drafted from, and not already be paid over
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

  -- expenses: each still open, for this property, and adding up
  SELECT count(*), COALESCE(sum(amount), 0) INTO n_exp, exp_total FROM public.recharge_expenses
   WHERE id IN (SELECT (e->>'id')::UUID FROM jsonb_array_elements(COALESCE(p->'expenses', '[]')) e)
     AND property_id = prop AND included_in_statement_id IS NULL AND voided_at IS NULL;
  IF n_exp <> jsonb_array_length(COALESCE(p->'expenses', '[]')) OR round(exp_total, 2) <> exps THEN
    RAISE EXCEPTION 'An expense has changed or is already on a statement — prepare it again';
  END IF;

  -- letting fees: each not yet charged, for this property, and adding up
  SELECT COALESCE(sum(letting_fee_charged), 0) INTO let_total FROM public.tenancies
   WHERE id IN (SELECT (x #>> '{}')::UUID FROM jsonb_array_elements(COALESCE(p->'letting_fee_tenancies', '[]')) x)
     AND property_id = prop AND letting_fee_statement_id IS NULL;
  IF round(let_total, 2) <> letf THEN RAISE EXCEPTION 'A letting fee has changed or is already charged — prepare it again'; END IF;

  -- the next LS number (one at a time)
  PERFORM pg_advisory_xact_lock(hashtext('cros_ls_number'));
  SELECT 'LS' || lpad((COALESCE(max(substring(statement_reference FROM 3)::INT), 0) + 1)::TEXT, 4, '0') INTO ref
    FROM public.landlord_statements WHERE statement_reference ~ '^LS[0-9]+$';

  INSERT INTO public.landlord_statements (landlord_id, property_id, statement_reference, reference, statement_date, period_start, period_end,
      gross_rent, management_fees, letting_fees, property_charges, net_to_landlord, management_fee_pct, rooms, expenses, source, created_by)
  VALUES ((p->>'landlord_id')::UUID, prop, ref, ref, (p->>'statement_date')::DATE, (p->>'period_start')::DATE, (p->>'period_end')::DATE,
      gross, mgmt, letf, exps, net, NULLIF(p->>'management_fee_pct', '')::NUMERIC, COALESCE(p->'rooms', '[]'), COALESCE(p->'expenses', '[]'),
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

-- tidy from 192: the helper functions are for signed-in users only
REVOKE EXECUTE ON FUNCTION public.cros_me(), public.cros_my_role(), public.cros_is_admin(), public.cros_my_property_ids(), public.cros_can_see_person(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cros_me(), public.cros_my_role(), public.cros_is_admin(), public.cros_my_property_ids(), public.cros_can_see_person(UUID) TO authenticated, service_role;
