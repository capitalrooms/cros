-- Allow 'declined' status in assigned_jobs so cleaners can decline a job
-- and admin is flagged for reassignment.
-- Also adds due_date for calendar display (populated from move-out date).

ALTER TABLE public.assigned_jobs
  DROP CONSTRAINT IF EXISTS assigned_jobs_status_check;

ALTER TABLE public.assigned_jobs
  ADD CONSTRAINT assigned_jobs_status_check
  CHECK (status IN ('pending','accepted','completed','declined'));

ALTER TABLE public.assigned_jobs
  ADD COLUMN IF NOT EXISTS due_date DATE;
