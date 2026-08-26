-- Migration 082: fix property_appointments RLS.
--
-- Both policies compared people.id / tenancies.person_id to auth.uid(), but in
-- this project people.id is NOT auth.uid() (auth maps by email). So the admin
-- policy never matched — booking an appointment failed with a 42501 RLS error —
-- and the tenant read policy never matched either. Match by email instead.
-- Idempotent.

DROP POLICY IF EXISTS "admin_all_appointments" ON public.property_appointments;
CREATE POLICY "admin_all_appointments" ON public.property_appointments
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.people WHERE email = auth.jwt() ->> 'email') IN ('administrator', 'admin', 'lettings')
  )
  WITH CHECK (
    (SELECT role FROM public.people WHERE email = auth.jwt() ->> 'email') IN ('administrator', 'admin', 'lettings')
  );

DROP POLICY IF EXISTS "tenant_view_appointments" ON public.property_appointments;
CREATE POLICY "tenant_view_appointments" ON public.property_appointments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenancies t
      WHERE t.property_id = property_appointments.property_id
        AND t.person_id = (SELECT id FROM public.people WHERE email = auth.jwt() ->> 'email')
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
    )
  );

NOTIFY pgrst, 'reload schema';
