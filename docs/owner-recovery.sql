-- OWNER RECOVERY — for use ONLY in the Supabase dashboard's SQL editor, by someone with access to the CROS project.
-- Never run from the app, never commit a filled-in copy. (19 Nov 2026)
--
-- When to use it: the owner's sign-in was deleted and re-created (so the auth user ID changed), or the owner flag
-- was cleared by mistake. Normal sign-in problems (forgotten password, two-step) are fixed in Supabase Auth, not here.
--
-- Steps:
--   1. Find the NEW auth user ID for the owner: Supabase dashboard → Authentication → Users → the owner's email → copy the ID.
--   2. Replace OWNER_UID below with that ID. Run the whole script. It stops, changing nothing, if any check fails.
--   3. Check the output row: exactly one owner, with the expected email.

DO $$
DECLARE
  owner_uid CONSTANT UUID := '00000000-0000-0000-0000-000000000000';   -- ← replace with the owner's auth user ID
  acct_email TEXT;
  acct_active BOOLEAN;
  n_people INT;
  n_owners INT;
BEGIN
  SELECT email, (deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= now()))
    INTO acct_email, acct_active FROM auth.users WHERE id = owner_uid;
  IF acct_email IS NULL THEN RAISE EXCEPTION 'No auth user % — nothing changed.', owner_uid; END IF;
  IF NOT acct_active THEN RAISE EXCEPTION 'Auth user % is deleted or banned — restore it in Authentication first. Nothing changed.', owner_uid; END IF;
  SELECT count(*) INTO n_people FROM public.people WHERE lower(email) = lower(acct_email);
  IF n_people <> 1 THEN RAISE EXCEPTION 'That email matches % people records; expected one. Nothing changed.', n_people; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE lower(email) = lower(acct_email) AND role IN ('administrator', 'admin')) THEN
    RAISE EXCEPTION 'The owner must be an administrator office account. Nothing changed.';
  END IF;
  -- clear any old owner first, so there is only ever one
  PERFORM set_config('cros.owner_change', 'on', true);
  UPDATE public.people SET is_owner = FALSE WHERE is_owner;
  UPDATE public.people SET is_owner = TRUE WHERE lower(email) = lower(acct_email);
  PERFORM set_config('cros.owner_change', 'off', true);
  SELECT count(*) INTO n_owners FROM public.people WHERE is_owner;
  IF n_owners <> 1 THEN RAISE EXCEPTION 'Expected exactly one owner, found % — rolled back.', n_owners; END IF;
END $$;

SELECT id, email, role, is_owner FROM public.people WHERE is_owner;
