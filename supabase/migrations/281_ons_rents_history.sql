-- 281 (12 Nov 2026, Harry: market reports and "ask the data"). Every month of the ONS rents for every area — not just
-- the latest (ons_rents, migration 280) — so reports can show trends. Filled from the same monthly workbook
-- (lib/rents/ons). Office staff read; only the server writes.
CREATE TABLE IF NOT EXISTS public.ons_rents_history (
  area_code   text NOT NULL,
  period      date NOT NULL,
  rent_all    integer, rent_1 integer, rent_2 integer, rent_3 integer, rent_4 integer, rent_flat integer,
  change_all  numeric,
  PRIMARY KEY (area_code, period)
);
ALTER TABLE public.ons_rents_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads ons rents history" ON public.ons_rents_history;
CREATE POLICY "office reads ons rents history" ON public.ons_rents_history FOR SELECT TO authenticated USING (public.cros_is_staff());
REVOKE ALL ON public.ons_rents_history FROM anon;
