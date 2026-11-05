-- 263 — VAT on landlords' expenses and company costs (Harry, 5 Nov 2026: "not all landlords are VAT registered so you
-- need to build it based on whether the landlord is VAT registered and allow us to click the options for how we are
-- managing the VAT").
--   · a landlord can be VAT registered (with a number), and has a chosen way we handle VAT on costs we pay for them:
--       'disbursement' — passed on at cost, exactly what the receipt says (the default; HMRC Notice 700 s.25)
--       'recharge'     — Capital Rooms reclaims the receipt's VAT and recharges net + VAT (only once we're registered)
--   · every landlord expense records the VAT on the receipt, the treatment used and any VAT we charged on it
--   · a company cost records the VAT on its receipt (reclaimable once registered)
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS expense_vat_treatment TEXT NOT NULL DEFAULT 'disbursement';
DO $$ BEGIN
  ALTER TABLE public.people ADD CONSTRAINT people_expense_vat_treatment_check CHECK (expense_vat_treatment IN ('disbursement', 'recharge'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.recharge_expenses ADD COLUMN IF NOT EXISTS vat_treatment TEXT;
ALTER TABLE public.recharge_expenses ADD COLUMN IF NOT EXISTS vat_on_receipt NUMERIC(10,2);   -- input VAT shown on the receipt
ALTER TABLE public.recharge_expenses ADD COLUMN IF NOT EXISTS vat_charged NUMERIC(10,2);      -- output VAT in what the landlord is charged (recharge only)
DO $$ BEGIN
  ALTER TABLE public.recharge_expenses ADD CONSTRAINT recharge_expenses_vat_treatment_check CHECK (vat_treatment IS NULL OR vat_treatment IN ('disbursement', 'recharge'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(10,2);
