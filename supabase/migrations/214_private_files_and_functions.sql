-- 214 — lock-down, 9 Oct 2026 ("tech company safe").
-- 1. The folders holding documents and repair photos stop serving files to anyone with the link. Screens now ask
--    for a short-lived signed link (app/api/files/sign), which checks who is asking. property-photos (advert photos)
--    stays public on purpose.
-- 2. Database functions stop being callable with the public (anon) key. Postgres lets everyone run a new function by
--    default; signed-in users keep exactly what they could run before, the server keeps everything.
-- Safe to run more than once.

UPDATE storage.buckets SET public = false
WHERE id IN ('property-documents', 'maintenance-photos', 'job-photos', 'tenant-guides');

DO $$
DECLARE f record; keep boolean;
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'cros\_%' OR p.proname IN ('next_finance_no', 'take_supplier_invoice_number'))
  LOOP
    keep := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    IF keep THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig); END IF;
  END LOOP;
END $$;

-- check: should return no rows
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname LIKE 'cros\_%' AND has_function_privilege('anon', p.oid, 'EXECUTE');
