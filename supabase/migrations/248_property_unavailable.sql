-- 248 — A house that isn't available to let (29 Oct 2026, Harry: "24 Spurgeon Road was managed but it's now vacant
-- and planned to be vacant due to subsidence but that's affecting our void rate. We should be able to tick that it's
-- not available"). From unavailable_from its empty rooms aren't counted as void and it isn't treated as on the market.
-- Clearing the date puts it back. Safe to run more than once.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS unavailable_from date;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS unavailable_reason text;
COMMENT ON COLUMN public.properties.unavailable_from IS 'Not available to let from this date (e.g. major works); empty rooms are not void. Null = available.';
COMMENT ON COLUMN public.properties.unavailable_reason IS 'Why the house is not available, e.g. Subsidence repairs.';
