-- 306 — Planned Works: multi-day projects on a maintenance job (24 Nov 2026, approved by Harry).
-- A standard job is booked once and completed once. A planned job runs over several working days: the contractor adds a
-- daily update (never completes the project); staff confirm completion. Facility availability is tracked separately from
-- project progress. Nothing is deleted: updates are an append-only trail (same rule as other records).

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'standard' CHECK (job_type IN ('standard', 'planned')),
  ADD COLUMN IF NOT EXISTS planned_duration_days INTEGER CHECK (planned_duration_days IS NULL OR planned_duration_days > 0),
  ADD COLUMN IF NOT EXISTS planned_start_on DATE,
  ADD COLUMN IF NOT EXISTS expected_complete_on DATE,
  ADD COLUMN IF NOT EXISTS project_status TEXT CHECK (project_status IS NULL OR project_status IN ('planned', 'in_progress', 'paused', 'delayed', 'completed'));

CREATE TABLE IF NOT EXISTS public.project_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES public.maintenance_tickets(id),
  update_date    DATE NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('daily', 'delay', 'paused', 'completion_requested', 'office', 'facility')),
  message         TEXT NOT NULL,
  return_on       DATE,
  proposed_complete_on DATE,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_updates_ticket_idx ON public.project_updates (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.project_facilities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES public.maintenance_tickets(id),
  name            TEXT NOT NULL,
  facility_status TEXT NOT NULL DEFAULT 'unavailable' CHECK (facility_status IN ('available', 'restricted', 'unavailable', 'partial', 'restored')),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by      TEXT,
  UNIQUE (ticket_id, name)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'project_updates_no_delete') THEN
    CREATE TRIGGER project_updates_no_delete BEFORE DELETE ON public.project_updates FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
END $$;

ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_facilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads and writes project updates" ON public.project_updates;
CREATE POLICY "office reads and writes project updates" ON public.project_updates FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
DROP POLICY IF EXISTS "office reads and writes project facilities" ON public.project_facilities;
CREATE POLICY "office reads and writes project facilities" ON public.project_facilities FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
