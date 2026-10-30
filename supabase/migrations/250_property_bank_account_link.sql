-- Migration 250: a house links to one of its landlord's bank accounts (30 Oct 2026)
-- The account lives on the landlord (landlord_bank_accounts); the house points at it. The house's own bank_* columns
-- stay as a copy kept in step by the app (lib/banking/propertyAccount), so statements and payouts read them unchanged.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.landlord_bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_properties_bank_account ON public.properties(bank_account_id);
