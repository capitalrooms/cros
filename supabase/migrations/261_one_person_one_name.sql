-- 261: one person, one name (Harry, 3 Nov 2026: "the applicant file when becoming tenant file should be the same thing
-- … very worrying that you have two copies of everything"). Once an applicant becomes a tenant the PERSON record is
-- the one true copy of their name and contact details; their application follows it automatically, whichever screen
-- the change was made on. Existing linked applications are brought into line once (tenants only).
-- ADDITIVE, idempotent: safe to run more than once.
CREATE OR REPLACE FUNCTION public.person_to_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM 'tenant' THEN RETURN NEW; END IF;
  UPDATE public.applicants a SET
    salutation    = COALESCE(NEW.salutation, a.salutation),
    first_name    = COALESCE(NEW.first_name, a.first_name),
    middle_name   = COALESCE(NEW.middle_name, a.middle_name),
    last_name     = COALESCE(NEW.last_name, a.last_name),
    full_name     = COALESCE(NULLIF(concat_ws(' ', NEW.first_name, NEW.middle_name, NEW.last_name), ''), NEW.full_name, a.full_name),
    email         = COALESCE(NEW.email, a.email),
    phone         = COALESCE(NEW.phone, a.phone),
    date_of_birth = COALESCE(NEW.date_of_birth, a.date_of_birth)
  WHERE a.converted_person_id = NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS person_to_application ON public.people;
CREATE TRIGGER person_to_application AFTER UPDATE OF salutation, first_name, middle_name, last_name, full_name, email, phone, date_of_birth
  ON public.people FOR EACH ROW EXECUTE FUNCTION public.person_to_application();

-- bring existing tenants' applications into line now
UPDATE public.applicants a SET
  salutation = COALESCE(p.salutation, a.salutation), first_name = COALESCE(p.first_name, a.first_name),
  middle_name = COALESCE(p.middle_name, a.middle_name), last_name = COALESCE(p.last_name, a.last_name),
  full_name = COALESCE(NULLIF(concat_ws(' ', p.first_name, p.middle_name, p.last_name), ''), p.full_name, a.full_name),
  email = COALESCE(p.email, a.email), phone = COALESCE(p.phone, a.phone), date_of_birth = COALESCE(p.date_of_birth, a.date_of_birth)
FROM public.people p
WHERE a.converted_person_id = p.id AND p.role = 'tenant';
