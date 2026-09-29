-- Migration 189: client money — the pieces the 27 Sep 2026 finance audit found missing.
--
--  1. finance_audit_log + triggers   every insert/update/delete on rent_charges, landlord_statements,
--                                     recharge_expenses and client_ledger_adjustments is recorded (before/after,
--                                     who, when) — whichever screen or route made the change.
--  2. Statement lock                  once a statement has been sent, its figures can't be changed or it deleted;
--                                     corrections go on the next statement / as a ledger adjustment.
--  3. client_ledger_adjustments       opening balances and one-off corrections on a landlord's client ledger.
--  4. client_reconciliations          the monthly three-way check: bank balance vs cash book vs client ledgers.
--  5. arrears_actions                 log of every arrears contact (reminder, letter, call, promise to pay…).
--  6. Deposits                        tenancies.deposit_protected_at / deposit_scheme / prescribed_info_served_at.
--  7. people.nrl_approval_ref         HMRC Non-Resident Landlord approval reference (landlords do their own NRL).
--  8. system_settings client_ledger_start — the date the client ledger starts from (1 Oct 2026, the first month rent charges are raised automatically).
--
-- ADDITIVE ONLY (plus triggers). Idempotent: safe to run more than once. Needs cros_is_staff() from migration 183.

-- ── 1. Finance audit log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  row_id      UUID,
  action      TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_row     JSONB,
  new_row     JSONB,
  actor       TEXT,                       -- signed-in user's email, or 'system' for server jobs
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_audit_log_row_idx ON public.finance_audit_log (table_name, row_id, at DESC);
CREATE INDEX IF NOT EXISTS finance_audit_log_at_idx  ON public.finance_audit_log (at DESC);

CREATE OR REPLACE FUNCTION public.cros_finance_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who TEXT;
BEGIN
  BEGIN who := coalesce(auth.jwt()->>'email', 'system'); EXCEPTION WHEN others THEN who := 'system'; END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.finance_audit_log (table_name, row_id, action, new_row, actor) VALUES (TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW), who);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
      INSERT INTO public.finance_audit_log (table_name, row_id, action, old_row, new_row, actor) VALUES (TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), who);
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.finance_audit_log (table_name, row_id, action, old_row, actor) VALUES (TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), who);
    RETURN OLD;
  END IF;
END $$;

-- ── 3. Client ledger adjustments (before the audit triggers so it can be audited too) ──
CREATE TABLE IF NOT EXISTS public.client_ledger_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id  UUID REFERENCES public.people(id) ON DELETE SET NULL,
  property_id  UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  entry_date   DATE NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('opening_balance', 'correction', 'rent_other', 'expense_paid', 'payout', 'fee', 'deposit_in', 'deposit_out')),
  description  TEXT NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,      -- + money held for the landlord / in the client account, − money out
  reference    TEXT,
  created_by   UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at    TIMESTAMPTZ,
  void_reason  TEXT
);
CREATE INDEX IF NOT EXISTS client_ledger_adjustments_landlord_idx ON public.client_ledger_adjustments (landlord_id, entry_date);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rent_charges', 'landlord_statements', 'recharge_expenses', 'client_ledger_adjustments'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_finance_audit') THEN
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cros_finance_audit()', t || '_finance_audit', t);
    END IF;
  END LOOP;
END $$;

-- ── 2. Statement lock ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cros_statement_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sent_at IS NOT NULL THEN RAISE EXCEPTION 'This statement has been sent to the landlord and cannot be deleted.'; END IF;
    RETURN OLD;
  END IF;
  -- Figures are frozen once sent (unless the same update clears sent_at — a deliberate unlock, which is audited).
  IF OLD.sent_at IS NOT NULL AND NEW.sent_at IS NOT NULL AND (
       NEW.gross_rent IS DISTINCT FROM OLD.gross_rent OR NEW.management_fees IS DISTINCT FROM OLD.management_fees
    OR NEW.property_charges IS DISTINCT FROM OLD.property_charges OR NEW.net_to_landlord IS DISTINCT FROM OLD.net_to_landlord
    OR NEW.rooms IS DISTINCT FROM OLD.rooms OR NEW.expenses IS DISTINCT FROM OLD.expenses
    OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end) THEN
    RAISE EXCEPTION 'This statement has been sent to the landlord, so its figures are locked. Put any correction on the next statement.';
  END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'landlord_statements_lock') THEN
    CREATE TRIGGER landlord_statements_lock BEFORE UPDATE OR DELETE ON public.landlord_statements FOR EACH ROW EXECUTE FUNCTION public.cros_statement_lock();
  END IF;
END $$;

-- ── 4. Monthly reconciliation ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_reconciliations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_at             DATE NOT NULL,
  bank_balance      NUMERIC(12,2) NOT NULL,     -- from the client account bank statement
  cashbook_balance  NUMERIC(12,2) NOT NULL,     -- what CROS says came in minus went out
  ledgers_total     NUMERIC(12,2) NOT NULL,     -- sum of every landlord ledger + deposits held
  difference        NUMERIC(12,2) NOT NULL,     -- bank − cash book
  notes             TEXT,
  signed_by         UUID REFERENCES public.people(id) ON DELETE SET NULL,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_reconciliations_as_at_idx ON public.client_reconciliations (as_at DESC);

-- ── 5. Arrears contact log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arrears_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id   UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('reminder', 'letter', 'call', 'text', 'promise', 'payment_plan', 'note', 'legal')),
  note         TEXT,
  promised_amount NUMERIC(10,2),
  promised_date   DATE,
  created_by   UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arrears_actions_tenancy_idx ON public.arrears_actions (tenancy_id, created_at DESC);

-- ── 6. Deposits ───────────────────────────────────────────────────────────────
ALTER TABLE public.tenancies ADD COLUMN IF NOT EXISTS deposit_protected_at      DATE;
ALTER TABLE public.tenancies ADD COLUMN IF NOT EXISTS deposit_scheme            TEXT;   -- e.g. 'DPS custodial'
ALTER TABLE public.tenancies ADD COLUMN IF NOT EXISTS prescribed_info_served_at DATE;

-- ── 7. NRL ────────────────────────────────────────────────────────────────────
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS nrl_approval_ref TEXT;

-- ── 8. Ledger start date ──────────────────────────────────────────────────────
INSERT INTO public.system_settings (key, value)
SELECT 'client_ledger_start', '2026-10-01'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'client_ledger_start');

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.finance_audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_ledger_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_reconciliations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrears_actions           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_ledger_adjustments', 'client_reconciliations', 'arrears_actions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'staff manage ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())', 'staff manage ' || t, t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'finance_audit_log' AND policyname = 'staff read finance_audit_log') THEN
    CREATE POLICY "staff read finance_audit_log" ON public.finance_audit_log FOR SELECT TO authenticated USING (public.cros_is_staff());
  END IF;
END $$;

-- ── 9. payment_audit_log actions ─────────────────────────────────────────────
-- The code logs 'promoted_overdue' (overdue cron), 'manual_allocated' and 'fuzzy_confirmed' (bank allocation),
-- but the original CHECK (migration 168) didn't allow them, so those audit rows were silently rejected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_audit_log') THEN
    ALTER TABLE public.payment_audit_log DROP CONSTRAINT IF EXISTS payment_audit_log_action_check;
    ALTER TABLE public.payment_audit_log ADD CONSTRAINT payment_audit_log_action_check CHECK (action IN (
      'created', 'amount_due_edited', 'manually_paid', 'csv_matched', 'voided', 'status_changed',
      'amount_received_adjusted', 'promoted_overdue', 'manual_allocated', 'fuzzy_confirmed'));
  END IF;
END $$;
