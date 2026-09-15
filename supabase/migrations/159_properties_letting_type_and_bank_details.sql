-- Migration 159: Letting type + per-property bank details
-- Properties can be 'managed' (full management) or 'let_only' (find tenant, hand over).
-- Bank details are per-property because a landlord may use different accounts per house.

ALTER TABLE public.properties
  -- Letting type: managed (default) or let_only
  ADD COLUMN IF NOT EXISTS letting_type          TEXT    NOT NULL DEFAULT 'managed',

  -- Landlord bank details (used in tenancy agreements and check-in letters for let-only)
  ADD COLUMN IF NOT EXISTS bank_account_name     TEXT,
  ADD COLUMN IF NOT EXISTS bank_sort_code        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS bank_account_number   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_iban             TEXT,
  ADD COLUMN IF NOT EXISTS bank_swift            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_payment_ref      TEXT,  -- e.g. "008ROC" — unit number appended per room

  -- Let-only fee structure
  ADD COLUMN IF NOT EXISTS letting_fee_pct       NUMERIC(5,2),  -- % of first month's rent
  ADD COLUMN IF NOT EXISTS letting_fee_flat      NUMERIC(10,2), -- or flat fee alternative

  -- Rent due preference for let-only landlords
  ADD COLUMN IF NOT EXISTS rent_due_preference   TEXT NOT NULL DEFAULT 'fixed_day'; -- 'fixed_day' | 'move_in_date'

COMMENT ON COLUMN public.properties.letting_type        IS 'managed | let_only — can be changed as the relationship evolves';
COMMENT ON COLUMN public.properties.bank_account_name   IS 'Name on the landlord bank account for this property';
COMMENT ON COLUMN public.properties.bank_sort_code      IS 'Sort code (UK) for landlord payments';
COMMENT ON COLUMN public.properties.bank_account_number IS 'Account number for landlord payments';
COMMENT ON COLUMN public.properties.bank_iban           IS 'IBAN for international transfers';
COMMENT ON COLUMN public.properties.bank_swift          IS 'SWIFT/BIC code';
COMMENT ON COLUMN public.properties.bank_payment_ref    IS 'Base payment reference — room/unit code appended per tenancy';
COMMENT ON COLUMN public.properties.letting_fee_pct     IS 'Let-only fee as % of first month rent (e.g. 75 = 75%)';
COMMENT ON COLUMN public.properties.letting_fee_flat    IS 'Let-only fee as flat amount alternative to percentage';
COMMENT ON COLUMN public.properties.rent_due_preference IS 'fixed_day = use rent_due_day; move_in_date = rent due on tenant move-in date each month';

NOTIFY pgrst, 'reload schema';
