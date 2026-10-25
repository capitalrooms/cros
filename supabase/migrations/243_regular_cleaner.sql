-- 243 — Each house's regular cleaner (24 Oct 2026, Harry: "we should be able to assign certain cleaners"). Chosen on
-- Cleaning; new move-out cleans at the house go to them unless someone else is picked, and Quick Notify's "Cleaners"
-- reaches the house's own cleaners instead of every cleaner in CROS. Safe to run more than once.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS regular_cleaner_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS properties_regular_cleaner_idx ON public.properties (regular_cleaner_id);
COMMENT ON COLUMN public.properties.regular_cleaner_id IS 'The cleaner who usually cleans this house (Cleaning screen).';
