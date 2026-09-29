-- Migration 165: Add preferred_name to people
-- Used as the sign-off name in SMS messages (e.g. "Harry" rather than full "Harry Smith").
-- Falls back to first_name in getSmsSignOff if not set.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS preferred_name TEXT DEFAULT NULL;

COMMENT ON COLUMN public.people.preferred_name IS
  'Short name for SMS sign-offs — e.g. "Harry". Falls back to first_name if null.';

NOTIFY pgrst, 'reload schema';
