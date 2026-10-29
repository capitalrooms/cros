-- 249 — Room for encrypted bank details (29 Oct 2026). Sort codes, account numbers and IBANs are now stored encrypted
-- (lib/crypto/fieldCrypt — "enc:v1:…", ~55–100 characters), which doesn't fit the old VARCHAR(10)/(20) columns.
-- Widening to TEXT keeps every existing value exactly as it is. Safe to run more than once.
ALTER TABLE public.landlord_bank_accounts ALTER COLUMN sort_code TYPE text;
ALTER TABLE public.landlord_bank_accounts ALTER COLUMN account_number TYPE text;
ALTER TABLE public.landlord_bank_accounts ALTER COLUMN iban TYPE text;
ALTER TABLE public.properties ALTER COLUMN bank_sort_code TYPE text;
ALTER TABLE public.properties ALTER COLUMN bank_account_number TYPE text;
ALTER TABLE public.properties ALTER COLUMN bank_iban TYPE text;
COMMENT ON COLUMN public.landlord_bank_accounts.account_number IS 'Encrypted (enc:v1:…) when CROS_FIELD_KEY is set — read through lib/crypto/fieldCrypt, never directly';
COMMENT ON COLUMN public.properties.bank_account_number IS 'Encrypted (enc:v1:…) when CROS_FIELD_KEY is set — read through lib/crypto/fieldCrypt, never directly';
