-- 207 — A maintenance job can be cancelled, always with a reason, so it is closed off on the record
-- (who cancelled it, when and why). Cancelled jobs drop out of every live list but stay on the record.
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS cancelled_by  UUID REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
