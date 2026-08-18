-- Fix 1: rooms table was missing INSERT/UPDATE/DELETE policies.
-- Only SELECT existed, blocking admins from creating or removing rooms.

DROP POLICY IF EXISTS admins_insert_rooms ON public.rooms;
CREATE POLICY admins_insert_rooms ON public.rooms FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.people WHERE email = auth.jwt()->>'email') = 'administrator'
  );

DROP POLICY IF EXISTS admins_update_rooms ON public.rooms;
CREATE POLICY admins_update_rooms ON public.rooms FOR UPDATE
  USING (
    (SELECT role FROM public.people WHERE email = auth.jwt()->>'email') = 'administrator'
  );

DROP POLICY IF EXISTS admins_delete_rooms ON public.rooms;
CREATE POLICY admins_delete_rooms ON public.rooms FOR DELETE
  USING (
    (SELECT role FROM public.people WHERE email = auth.jwt()->>'email') = 'administrator'
  );

-- Fix 2: property_documents tenant read policy used people.id = auth.uid()
-- which never matches (people.id ≠ auth.uid()). Replaced with email-based
-- lookup through tenancies → rooms → property_id. Also adds visible_to_tenants
-- guard so only explicitly shared documents reach tenants.

DROP POLICY IF EXISTS tenants_read_property_docs ON public.property_documents;
CREATE POLICY tenants_read_property_docs ON public.property_documents FOR SELECT
  USING (
    visible_to_tenants = true
    AND property_id IN (
      SELECT r.property_id
      FROM public.tenancies t
      JOIN public.rooms r ON r.id = t.room_id
      JOIN public.people p ON p.id = t.person_id
      WHERE p.email = auth.jwt()->>'email'
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
    )
  );

-- Applied directly to production via Supabase Management API (2026-08-17).
