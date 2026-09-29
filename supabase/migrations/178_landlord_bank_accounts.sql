-- Migration 178: Landlord bank accounts
-- One landlord can have multiple bank accounts (different accounts per property).
-- Used in tenancy agreement generator to populate bank payment details.

CREATE TABLE IF NOT EXISTS public.landlord_bank_accounts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id      UUID        NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  account_label    TEXT        NOT NULL,          -- display name, e.g. "Barclays Main", "HSBC Rental"
  bank_name        TEXT,
  account_name     TEXT        NOT NULL,           -- name on account
  sort_code        VARCHAR(10),                    -- UK sort code, e.g. "20-49-76"
  account_number   VARCHAR(20),
  iban             TEXT,
  swift            VARCHAR(20),
  is_default       BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landlord_bank_accounts_landlord
  ON public.landlord_bank_accounts(landlord_id);

-- Only one default per landlord
CREATE UNIQUE INDEX IF NOT EXISTS idx_landlord_bank_accounts_one_default
  ON public.landlord_bank_accounts(landlord_id)
  WHERE is_default = true;

ALTER TABLE public.landlord_bank_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'landlord_bank_accounts'
    AND policyname = 'landlord_bank_accounts_admin'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "landlord_bank_accounts_admin"
        ON public.landlord_bank_accounts
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
