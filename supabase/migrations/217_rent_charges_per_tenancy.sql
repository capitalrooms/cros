-- 217 — Rent charges belong to a TENANCY, not just a room (Harry, 12 Oct 2026: "sometimes a landlord may need to
-- receive two rents for two tenants in one month"). Until now a room could have only one charge a month, so in a
-- changeover month (one tenant out on the 16th, the next in on the 17th) the newcomer's part-month had no charge,
-- the outgoing tenant's charge showed on the newcomer's letting file, and a newcomer's payment could be put against
-- the previous tenant's arrears.
--   • rent_charges.tenancy_id — whose rent it is
--   • filled in for every existing charge: the tenancy in the room that month (in a changeover month, the one that
--     was there on the 1st — that's who the existing part-month charge was raised for)
--   • one charge per tenancy per month (instead of per room per month)
-- ADDITIVE + constraint swap. Idempotent: safe to run more than once.

ALTER TABLE public.rent_charges ADD COLUMN IF NOT EXISTS tenancy_id UUID REFERENCES public.tenancies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rent_charges_tenancy_idx ON public.rent_charges (tenancy_id, charge_month);

UPDATE public.rent_charges rc SET tenancy_id = (
  SELECT t.id FROM public.tenancies t
  WHERE t.room_id = rc.room_id
    AND t.let_cancelled_at IS NULL
    AND t.start_date <= (date_trunc('month', rc.charge_month) + interval '1 month - 1 day')::date
    AND (t.end_date IS NULL OR t.end_date >= rc.charge_month)
  ORDER BY (t.start_date <= rc.charge_month) DESC, t.start_date ASC
  LIMIT 1)
WHERE rc.tenancy_id IS NULL;

-- drop the old one-per-room-per-month rule, whatever it was called
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'public.rent_charges'::regclass AND con.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a
           WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)) = ARRAY['charge_month', 'room_id']
  LOOP
    EXECUTE format('ALTER TABLE public.rent_charges DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rent_charges_tenancy_month_key') THEN
    ALTER TABLE public.rent_charges ADD CONSTRAINT rent_charges_tenancy_month_key UNIQUE (tenancy_id, charge_month);
  END IF;
END $$;

-- check: should return no rows (every charge has its tenancy)
-- SELECT id, room_id, charge_month FROM public.rent_charges WHERE tenancy_id IS NULL;
