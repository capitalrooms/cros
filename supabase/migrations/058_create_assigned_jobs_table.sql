-- Create assigned_jobs table for admin-requested cleaning tasks
CREATE TABLE IF NOT EXISTS public.assigned_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  cleaner_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES public.people(id) ON DELETE SET NULL,
  task_type VARCHAR(50) NOT NULL DEFAULT 'normal', -- 'normal', 'urgent', 'asap'
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'completed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_assigned_jobs_cleaner_id ON public.assigned_jobs(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_assigned_jobs_property_id ON public.assigned_jobs(property_id);
CREATE INDEX IF NOT EXISTS idx_assigned_jobs_status ON public.assigned_jobs(status);

-- Enable RLS
ALTER TABLE public.assigned_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can create and view all jobs
CREATE POLICY "admins_can_manage_assigned_jobs" ON public.assigned_jobs
  FOR ALL USING (
    auth.jwt() ->> 'email' IN (
      SELECT email FROM public.people WHERE role = 'administrator'
    )
  );

-- Policy: Cleaners can view their own assigned jobs
CREATE POLICY "cleaners_can_view_own_jobs" ON public.assigned_jobs
  FOR SELECT USING (
    cleaner_id = (SELECT id FROM public.people WHERE email = auth.jwt() ->> 'email' LIMIT 1)
  );

-- Policy: Cleaners can update their own jobs (accept/complete)
CREATE POLICY "cleaners_can_update_own_jobs" ON public.assigned_jobs
  FOR UPDATE USING (
    cleaner_id = (SELECT id FROM public.people WHERE email = auth.jwt() ->> 'email' LIMIT 1)
  );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_assigned_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::TEXT, NOW());
  RETURN NEW;
END;
$$ LANGUAGE PLPGSQL;

DROP TRIGGER IF EXISTS update_assigned_jobs_updated_at ON public.assigned_jobs;
CREATE TRIGGER update_assigned_jobs_updated_at
  BEFORE UPDATE ON public.assigned_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_assigned_jobs_updated_at();
