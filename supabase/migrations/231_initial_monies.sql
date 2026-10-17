-- 231 — Initial monies for let-only lets (17 Oct 2026). Harry: a let-only let's money through the client account —
-- holding deposit and final balance in, the tenant-find fee to the operations account, the rest to the landlord — must
-- be matched to the bank, numbered and logged like everything else. Wording as Alto and Reapit use it: "initial monies"
-- (the money a tenant pays before moving in); the agent's tenant-find fee comes off it and the landlord is paid the rest.
--
--   initial_monies     one per let-only tenancy (a mistake is voided, never deleted):
--                        in   — the holding deposit already held + the balance received (matched to its bank line)
--                        fee  — the tenant-find fee (also on the tenancy as its letting fee, numbered LETF)
--                        out  — paid to the landlord (numbered PAY when it's recorded as paid)
--                      the three must balance: holding + balance − fee = to the landlord
--   office_transfers   the tenant-find fee's move to the operations account (TRF) can now belong to an initial
--                      monies record instead of a monthly payment run
-- Numbers: INIT (initial monies received, new sequence), PAY (the landlord payment, existing sequence).
-- Office only; no deletes; every change in the finance audit log. Idempotent: safe to run more than once.

INSERT INTO public.finance_sequences (code, label) VALUES ('INIT', 'Initial monies received') ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.initial_monies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no               TEXT,                                                    -- INIT000001
  tenancy_id           UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE RESTRICT,
  property_id          UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  landlord_id          UUID REFERENCES public.people(id) ON DELETE SET NULL,
  holding_deposit_id   UUID REFERENCES public.holding_deposits(id) ON DELETE SET NULL,
  holding_amount       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (holding_amount >= 0),
  balance_amount       NUMERIC(12,2) NOT NULL CHECK (balance_amount >= 0),
  received_on          DATE NOT NULL,
  bank_transaction_id  UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  first_rent           NUMERIC(12,2) NOT NULL DEFAULT 0,                        -- what the money was for
  deposit              NUMERIC(12,2) NOT NULL DEFAULT 0,
  fee                  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),       -- tenant-find fee
  to_landlord          NUMERIC(12,2) NOT NULL,
  amount_paid          NUMERIC(12,2),                                           -- set when the landlord is paid
  paid_on              DATE,
  paid_reference       TEXT,
  payout_no            TEXT,                                                    -- PAY000001
  notes                TEXT,
  created_by           UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at            TIMESTAMPTZ,
  voided_by            UUID REFERENCES public.people(id) ON DELETE SET NULL,
  void_reason          TEXT,
  CONSTRAINT initial_monies_balances CHECK (round(holding_amount + balance_amount - fee - to_landlord, 2) = 0),
  CONSTRAINT initial_monies_paid_in_full CHECK (amount_paid IS NULL OR (amount_paid = to_landlord AND paid_on IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS initial_monies_one_per_tenancy ON public.initial_monies (tenancy_id) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS initial_monies_txn_no_key ON public.initial_monies (txn_no) WHERE txn_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS initial_monies_payout_no_key ON public.initial_monies (payout_no) WHERE payout_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS initial_monies_landlord_idx ON public.initial_monies (landlord_id, received_on);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'initial_monies_txn_no_number') THEN
    CREATE TRIGGER initial_monies_txn_no_number BEFORE INSERT OR UPDATE ON public.initial_monies FOR EACH ROW EXECUTE FUNCTION public.cros_assign_finance_no('txn_no', 'INIT', '-');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'initial_monies_payout_no_number') THEN
    CREATE TRIGGER initial_monies_payout_no_number BEFORE INSERT OR UPDATE ON public.initial_monies FOR EACH ROW EXECUTE FUNCTION public.cros_assign_finance_no('payout_no', 'PAY', 'amount_paid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'initial_monies_no_delete') THEN
    CREATE TRIGGER initial_monies_no_delete BEFORE DELETE ON public.initial_monies FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'initial_monies_finance_audit') THEN
    CREATE TRIGGER initial_monies_finance_audit AFTER INSERT OR UPDATE OR DELETE ON public.initial_monies FOR EACH ROW EXECUTE FUNCTION public.cros_finance_audit();
  END IF;
END $$;

ALTER TABLE public.initial_monies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages initial monies" ON public.initial_monies;
CREATE POLICY "office manages initial monies" ON public.initial_monies FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));
REVOKE ALL ON public.initial_monies FROM anon;

-- the tenant-find fee's transfer to the operations account: belongs to a payment run or to initial monies
ALTER TABLE public.office_transfers ALTER COLUMN payment_run_id DROP NOT NULL;
ALTER TABLE public.office_transfers ADD COLUMN IF NOT EXISTS initial_monies_id UUID REFERENCES public.initial_monies(id) ON DELETE RESTRICT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_transfers_belongs') THEN
    ALTER TABLE public.office_transfers ADD CONSTRAINT office_transfers_belongs CHECK (payment_run_id IS NOT NULL OR initial_monies_id IS NOT NULL);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS office_transfers_one_per_initial ON public.office_transfers (initial_monies_id) WHERE initial_monies_id IS NOT NULL AND voided_at IS NULL;
