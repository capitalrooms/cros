-- 236 — A tenant can reopen a finished repair (21 Oct 2026, Harry: "say this job is now closed but if it remains an
-- issue for them they can reopen it — why? it was never done, it has gone wrong again, I needed x doing too — it then
-- goes back to the contractor straight away"). The reopen is recorded on the job, counted, and the job goes back to
-- the same contractor. Changes are made by the server (tenants can't change jobs directly — migration 235).
-- Idempotent: safe to run more than once.
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS reopen_reason TEXT;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS reopen_note TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_tickets_reopen_reason') THEN
    ALTER TABLE public.maintenance_tickets ADD CONSTRAINT maintenance_tickets_reopen_reason
      CHECK (reopen_reason IS NULL OR reopen_reason IN ('not_done', 'broke_again', 'more_needed'));
  END IF;
END $$;
