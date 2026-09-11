-- Make assigned_by nullable so server-side inserts (e.g. from set-on-notice route)
-- can create assigned_jobs records without an admin person_id in scope.
ALTER TABLE public.assigned_jobs
  ALTER COLUMN assigned_by DROP NOT NULL;
