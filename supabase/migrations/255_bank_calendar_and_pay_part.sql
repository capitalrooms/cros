-- Migration 255 (1 Nov 2026): the bank import calendar, and paying landlords once.
--  · each import keeps how many lines (in and out) were on each day, and its opening/closing running balance, so the
--    calendar can show what's covered, what's only part of a day (imported during that day) and where lines are missing
--  · a bank line can be a holding deposit (reconciled from the calendar) — it's linked to the HOLD record
--  · a line that looks like one already imported (same day, amount and reference, different wording) is linked to it
--    for the office to decide
--  · rent_pay_part: "pay this landlord the rents that are in now" for one house and month. Without it a house waits
--    until all its rent is in, so the landlord is paid once (Harry: "we usually only want to pay landlords once all
--    rents are in. If one rent is missing unless we click to say pay only 5 we wait until the 6th is in")
ALTER TABLE public.bank_import_batches
  ADD COLUMN IF NOT EXISTS day_counts      JSONB,
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS balance_breaks  JSONB;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS balance            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS holding_deposit_id UUID REFERENCES public.holding_deposits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS near_duplicate_of  UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.rent_pay_part (
  property_id  UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  month        TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  reason       TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, month)
);
ALTER TABLE public.rent_pay_part ENABLE ROW LEVEL SECURITY;   -- office API only (service role)
