-- 245 — Each house's cleaning schedule (26 Oct 2026, onboarding the first real cleaner): its usual day and time, beside
-- how often (clean_frequency_weeks) and who (regular_cleaner_id, 243). Set on the Cleaning screen; saving it puts the
-- next clean in the cleaner's diary when none is booked. Before this the day and time were guessed from past cleans,
-- so a new cleaner had nothing to go on. Safe to run more than once.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS clean_day smallint CHECK (clean_day BETWEEN 1 AND 7);   -- 1 Monday … 7 Sunday
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS clean_time time;
COMMENT ON COLUMN public.properties.clean_day IS 'Usual cleaning day, 1 = Monday … 7 = Sunday (Cleaning screen).';
COMMENT ON COLUMN public.properties.clean_time IS 'Usual cleaning start time (Cleaning screen).';
