-- 280 (12 Nov 2026, Harry: "lets do 2" — official rents). The ONS Price Index of Private Rents (PIPR): average monthly
-- rent for every local authority, by bedrooms and property type, with the change on a year ago. Official statistics in
-- development, Crown copyright, free to reuse with attribution (Open Government Licence). The latest month for each
-- area is kept here, refreshed when ONS publishes (/api/cron/ons-rents, lib/rents/ons). Anyone signed in to the office
-- may read it; only the server writes.
CREATE TABLE IF NOT EXISTS public.ons_rents (
  area_code      text PRIMARY KEY,          -- e.g. E09000028
  area_name      text NOT NULL,             -- Southwark
  region         text,
  period         date NOT NULL,             -- the month the figures are for
  rent_all       integer, rent_1 integer, rent_2 integer, rent_3 integer, rent_4 integer,
  rent_flat      integer, rent_terraced integer, rent_semi integer, rent_detached integer,
  change_all     numeric, change_1 numeric, change_2 numeric, change_3 numeric, change_4 numeric,   -- % on a year ago
  release        text,                      -- the ONS release it came from
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ons_rents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads ons rents" ON public.ons_rents;
CREATE POLICY "office reads ons rents" ON public.ons_rents FOR SELECT TO authenticated USING (public.cros_is_staff());
REVOKE ALL ON public.ons_rents FROM anon;
