-- 241 — One live applicant per email address (22 Oct 2026, Harry: "sometimes when sending emails to applicants it makes
-- two applicants or three applicants — these should not be possible with the same email address"). The code now finds
-- the person first (lib/lettings/applicantRecord); this makes the database refuse a second live record too, whatever
-- the capitals or spaces. Archived records (merged, withdrawn) and ones already let (converted) don't count.
-- Merge any duplicates first (Applicants → "Same person, more than one record" → Merge into one); until then this
-- only reports them and changes nothing. Safe to run more than once.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT lower(btrim(email)) FROM public.applicants
    WHERE archived_at IS NULL AND pipeline_stage IS DISTINCT FROM 'converted' AND coalesce(btrim(email), '') <> ''
    GROUP BY 1 HAVING count(*) > 1) d;
  IF n > 0 THEN
    RAISE NOTICE '% email address(es) still have more than one applicant — merge them on the Applicants page, then run this again.', n;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS applicants_one_live_per_email ON public.applicants (lower(btrim(email)))
      WHERE archived_at IS NULL AND pipeline_stage IS DISTINCT FROM 'converted' AND coalesce(btrim(email), '') <> '';
    RAISE NOTICE 'Done — a second live applicant on the same email is now refused.';
  END IF;
END $$;
