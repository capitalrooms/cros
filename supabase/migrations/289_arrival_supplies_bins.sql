-- 289 — arriving at a property, supplies and bin days (14 Nov 2026).
--
-- Arriving: the key safe now shows only once a cleaner or contractor taps "I've arrived", and the notice the tenants
-- had decides what happens (lib/access/arrival):
--   · shared areas — under 4 hours' notice: a warning they must tick, then the code
--   · a tenant's room — under 24 hours: not without the tenant's yes (asked in one tap), unless the tenant has already
--     said "come in any time" (e.g. a repair they want fixed as soon as possible)
-- To know how much notice there was, a booking now records WHEN it was made (booked_at, set by a trigger whatever
-- screen or link did the booking).

ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS booked_at timestamptz;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS tenant_access_any_time boolean NOT NULL DEFAULT false;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS tenant_access_any_time_at timestamptz;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS arrival_ack text;          -- the short-notice warning they ticked
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS booked_at timestamptz;
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS arrival_ack text;

CREATE OR REPLACE FUNCTION public.stamp_booked_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'maintenance_tickets' THEN
    IF NEW.booked_date IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.booked_date IS DISTINCT FROM OLD.booked_date OR NEW.booked_slot IS DISTINCT FROM OLD.booked_slot) THEN
      NEW.booked_at := now();
    END IF;
  ELSE
    IF NEW.clean_date IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.clean_date IS DISTINCT FROM OLD.clean_date OR NEW.clean_time IS DISTINCT FROM OLD.clean_time) THEN
      NEW.booked_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS maintenance_tickets_booked_at ON public.maintenance_tickets;
CREATE TRIGGER maintenance_tickets_booked_at BEFORE INSERT OR UPDATE ON public.maintenance_tickets FOR EACH ROW EXECUTE FUNCTION public.stamp_booked_at();
DROP TRIGGER IF EXISTS cleans_booked_at ON public.cleans;
CREATE TRIGGER cleans_booked_at BEFORE INSERT OR UPDATE ON public.cleans FOR EACH ROW EXECUTE FUNCTION public.stamp_booked_at();

-- Supplies running low at a property, tapped in by the cleaner; cleared when someone restocks.
CREATE TABLE IF NOT EXISTS public.property_supplies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  item text NOT NULL,                               -- 'Bin bags', 'Toilet roll', 'Cleaning products', or typed
  reported_by uuid REFERENCES public.people(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  restocked_by uuid REFERENCES public.people(id),
  restocked_at timestamptz
);
CREATE INDEX IF NOT EXISTS property_supplies_open_idx ON public.property_supplies (property_id) WHERE restocked_at IS NULL;
ALTER TABLE public.property_supplies ENABLE ROW LEVEL SECURITY;   -- server only

-- Bin days looked up automatically (lib/bins): the council's own schedule, refreshed monthly.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bin_schedule jsonb;         -- [{ date, collections: [{ name, waste_type }] }]
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bin_source text;            -- 'whenisbins' | 'manual'
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bin_source_url text;        -- the council page it came from
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bin_checked_at timestamptz;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bin_lookup_error text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bin_property_token text;    -- the lookup service's id for re-reads

-- "The bins weren't collected" / "the day has changed", from tenants.
CREATE TABLE IF NOT EXISTS public.bin_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.people(id),
  kind text NOT NULL,                               -- 'missed' | 'changed'
  left_out boolean,                                 -- were they out on the kerb?
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);
ALTER TABLE public.bin_reports ENABLE ROW LEVEL SECURITY;          -- server only
