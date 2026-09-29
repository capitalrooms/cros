-- 194: Files — nobody but the office can list or browse any folder; the email inbox becomes private.
--
-- Found 28–29 Sep 2026: without signing in, anyone could LIST the files in inbox-docs (97 emailed documents —
-- references, IDs, statements), job-photos and property-photos, and download them (public folders).
-- Now:
--   • every storage rule is replaced with a small, known set:
--       office (cros_is_staff)                   everything, in every folder
--       tenants / contractors (signed in)         may add photos to maintenance-photos / job-photos, and see or
--                                                 replace only the photos they added themselves
--       everyone else, including not signed in    nothing — no listing, no uploads
--     Server routes use the service key and signed upload links, so they are unaffected.
--   • inbox-docs becomes PRIVATE: files open only through 5-minute signed links (office) or the move-in pack's
--     token. Run AFTER the Health Check "Move documents" step (filed documents must not point at the inbox).
--   • property-photos, property-documents, maintenance-photos, job-photos, tenant-guides stay readable by exact link
--     (photos and certificates are shown in the apps and emails), but can no longer be listed or browsed.
-- Idempotent: safe to run more than once.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "office manages all files" ON storage.objects FOR ALL TO authenticated
  USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
CREATE POLICY "tenants and contractors add job photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('maintenance-photos', 'job-photos'));
CREATE POLICY "uploaders see their own job photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('maintenance-photos', 'job-photos') AND owner = auth.uid());
CREATE POLICY "uploaders replace their own job photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('maintenance-photos', 'job-photos') AND owner = auth.uid())
  WITH CHECK (bucket_id IN ('maintenance-photos', 'job-photos') AND owner = auth.uid());

UPDATE storage.buckets SET public = FALSE WHERE id IN ('inbox-docs', 'finance-docs', 'landlord-docs', 'aml-data', 'valuations');
