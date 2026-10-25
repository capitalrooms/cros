-- 244 — Other people's records are names only (25 Oct 2026, security audit). A person's record holds their date of
-- birth, income, credit check, referencing, Right to Rent, ID photo, home address, bank details, UTR and signature.
-- The row rule decided WHICH people someone could read but not WHICH details, so a tenant could read their
-- housemates' whole records, and a contractor, cleaner or landlord the tenants at houses they work at or own.
--   • people: the office reads everything; anyone else reads only their own record.
--   • people_directory: everyone else's names (title, names, company) — exactly the people they could see before
--     (the office team, housemates, the contractor or cleaner coming to their house…).
-- Safe to run more than once.

CREATE OR REPLACE VIEW public.people_directory AS
  SELECT id, role, salutation, first_name, middle_name, last_name, full_name, preferred_name, company
    FROM public.people
   WHERE (SELECT public.cros_is_staff()) OR id = (SELECT public.cros_me()) OR id IN (SELECT public.cros_visible_people());
-- the view reads people with its owner's rights (so housemates' names still show); its WHERE is the visibility rule
ALTER VIEW public.people_directory OWNER TO postgres;
REVOKE ALL ON public.people_directory FROM PUBLIC, anon;
GRANT SELECT ON public.people_directory TO authenticated, service_role;

DROP POLICY IF EXISTS "people read what they should" ON public.people;
CREATE POLICY "people read what they should" ON public.people FOR SELECT TO authenticated
  USING ((SELECT public.cros_is_staff()) OR id = (SELECT public.cros_me()));
