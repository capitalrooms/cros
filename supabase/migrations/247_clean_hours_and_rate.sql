-- 247 — Hours worked on a clean, and a cleaner's hourly rate (26 Oct 2026, Harry: "can a cleaner say how long they
-- cleaned there? Does it feed with cost from their profile where their hourly rate is written"). The cleaner says how
-- long they were there when they finish a clean (or afterwards); their invoice prices each clean as hours × their rate.
-- duration_hours stays the booked length; hours_worked is what actually happened. Safe to run more than once.
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS hours_worked numeric(4,2) CHECK (hours_worked > 0 AND hours_worked <= 24);
ALTER TABLE public.supplier_profiles ADD COLUMN IF NOT EXISTS hourly_rate numeric(8,2) CHECK (hourly_rate >= 0);
COMMENT ON COLUMN public.cleans.hours_worked IS 'Hours the cleaner actually spent (entered when finishing, editable after).';
COMMENT ON COLUMN public.supplier_profiles.hourly_rate IS 'Cleaner''s hourly rate — invoices price each clean as hours_worked × this.';
