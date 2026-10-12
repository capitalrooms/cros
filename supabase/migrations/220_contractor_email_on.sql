-- 220 — Contractors have always been emailed their jobs, but people.notify_by_email defaults to off and no one ever
-- chose it. Now that each contractor's choice is used (lib/contractorContact, migration 219), turn email on for
-- contractors once; afterwards it's their choice (Emergencies screen or their profile). Runs its update only once.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'migration_220_contractor_email_on') THEN
    UPDATE public.people SET notify_by_email = TRUE WHERE role = 'contractor';
    INSERT INTO public.system_settings (key, value) VALUES ('migration_220_contractor_email_on', now()::text);
  END IF;
END $$;
