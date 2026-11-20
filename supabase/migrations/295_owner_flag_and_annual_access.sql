-- 295 — The owner flag and the "Annual financial reports" permission (19 Nov 2026, Harry).
--
-- ADDITIVE. Changes:
--   1. people.is_owner (boolean, default false). Every existing record gets false.
--   2. A guard: only this migration (inside a session flag) may set or clear is_owner. The app, the service role and
--      signed-in users are all refused.
--   3. The owner is marked by the stable auth user ID below. The migration stops, changing nothing, unless ALL of:
--        • the auth account exists and is active (not deleted, not banned);
--        • exactly one people record has that account's email (case-insensitive);
--        • that person is an administrator (role 'administrator' or 'admin');
--        • no other person is already marked owner.
--
-- The permission itself is the string 'annual_finance' in people.access_areas, granted or revoked only by the owner
-- (app: /api/admin/accounts set_annual, audited). No access_areas value is changed here.
-- Idempotent: safe to run more than once. Runs in one transaction: any failure rolls everything back.

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.cros_owner_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_owner)
     OR (TG_OP = 'UPDATE' AND NEW.is_owner IS DISTINCT FROM OLD.is_owner) THEN
    IF COALESCE(current_setting('cros.owner_change', true), '') <> 'on' THEN
      RAISE EXCEPTION 'The owner flag can only be set by a database migration (see docs/owner-recovery.sql).';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'people_owner_guard') THEN
    CREATE TRIGGER people_owner_guard BEFORE INSERT OR UPDATE OF is_owner ON public.people
      FOR EACH ROW EXECUTE FUNCTION public.cros_owner_guard();
  END IF;
END $$;

-- Mark the owner: Harry's administrator account, by its stable auth user ID. Every check must pass or nothing changes.
DO $$
DECLARE
  owner_uid CONSTANT UUID := '32fe30d1-e02d-41b3-921b-7167016b15d1';
  acct_email TEXT;
  acct_active BOOLEAN;
  n_people INT;
  n_owners INT;
BEGIN
  SELECT email, (deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= now()))
    INTO acct_email, acct_active
    FROM auth.users WHERE id = owner_uid;
  IF acct_email IS NULL THEN
    RAISE EXCEPTION 'Owner auth account % not found — nothing changed.', owner_uid;
  END IF;
  IF NOT acct_active THEN
    RAISE EXCEPTION 'Owner auth account % is deleted or banned — nothing changed. Restore it first.', owner_uid;
  END IF;

  SELECT count(*) INTO n_people FROM public.people WHERE lower(email) = lower(acct_email);
  IF n_people <> 1 THEN
    RAISE EXCEPTION 'Owner email matches % people records; expected exactly one — nothing changed.', n_people;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE lower(email) = lower(acct_email) AND role IN ('administrator', 'admin')) THEN
    RAISE EXCEPTION 'The owner must be an administrator office account — nothing changed.';
  END IF;

  SELECT count(*) INTO n_owners FROM public.people WHERE is_owner AND lower(email) <> lower(acct_email);
  IF n_owners > 0 THEN
    RAISE EXCEPTION 'Another owner is already marked (% records) — nothing changed.', n_owners;
  END IF;

  PERFORM set_config('cros.owner_change', 'on', true);
  UPDATE public.people SET is_owner = TRUE WHERE lower(email) = lower(acct_email);
  PERFORM set_config('cros.owner_change', 'off', true);

  SELECT count(*) INTO n_owners FROM public.people WHERE is_owner;
  IF n_owners <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one owner after the change, found % — rolled back.', n_owners;
  END IF;
END $$;
