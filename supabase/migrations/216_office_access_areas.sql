-- 216 — Access levels for office staff (Harry, 12 Oct 2026). people.access_areas = the parts of the office app a
-- non-administrator may use (lib/access/areas.ts: dashboard, properties, lettings, diary, maintenance, compliance,
-- finance, people, comms, newbusiness). NULL = their role's preset (lettings → lettings + diary). Administrators
-- always have everything. Only an administrator may change anyone's access, role or email — and only an
-- administrator may add an office account (otherwise a lettings login could add an "administrator" for itself).
-- ADDITIVE + guard. Idempotent: safe to run more than once.

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS access_areas TEXT[];

CREATE OR REPLACE FUNCTION public.cros_people_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'authenticated' AND NOT public.cros_is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IN ('administrator', 'admin', 'lettings') OR NEW.access_areas IS NOT NULL THEN
        RAISE EXCEPTION 'Only an administrator can add an office account.';
      END IF;
    ELSIF NEW.role IS DISTINCT FROM OLD.role OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email)
          OR NEW.access_areas IS DISTINCT FROM OLD.access_areas THEN
      RAISE EXCEPTION 'Only an administrator can change someone''s role, email address or access.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'people_role_email_guard') THEN
    CREATE TRIGGER people_role_email_guard BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.cros_people_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'people_office_insert_guard') THEN
    CREATE TRIGGER people_office_insert_guard BEFORE INSERT ON public.people FOR EACH ROW EXECUTE FUNCTION public.cros_people_guard();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.cros_people_guard() FROM PUBLIC, anon;
