-- 278 (12 Nov 2026, Harry: let-only landlords send us who lives in each room → we paste their reply in → CROS keeps
-- each person's details, texts them when a viewing is booked, uses their names, and describes the household on adverts
-- — "sharing with a male coder who is 27 and …").
-- Adds to let_only_occupants (mig 215, reference only — never a tenancy):
--   occupation, age (as the landlord gave it, with the date it was given so it can count on), gender as given, and
--   share_on_adverts — the landlord confirmed the tenant is happy to be described (never named) on adverts.
-- And properties.occupants_asked_at — when we last emailed the landlord asking who lives there.
-- ADDITIVE ONLY. Idempotent.
ALTER TABLE public.let_only_occupants ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE public.let_only_occupants ADD COLUMN IF NOT EXISTS age integer CHECK (age IS NULL OR (age BETWEEN 16 AND 100));
ALTER TABLE public.let_only_occupants ADD COLUMN IF NOT EXISTS age_noted_on date;
ALTER TABLE public.let_only_occupants ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.let_only_occupants ADD COLUMN IF NOT EXISTS share_on_adverts boolean NOT NULL DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS occupants_asked_at timestamptz;
