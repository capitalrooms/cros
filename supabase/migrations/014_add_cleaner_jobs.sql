-- Add Cleaner Jobs System
-- Enables tracking of cleaning jobs and their assignments

-- 1. Create cleaner_jobs table
CREATE TABLE IF NOT EXISTS public.cleaner_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_slot VARCHAR(50),
  cleaner_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'scheduled',
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cleaner_jobs_property ON public.cleaner_jobs(property_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_jobs_scheduled_date ON public.cleaner_jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaner_jobs_cleaner_id ON public.cleaner_jobs(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_jobs_status ON public.cleaner_jobs(status);

-- 3. Enable RLS
ALTER TABLE public.cleaner_jobs ENABLE ROW LEVEL SECURITY;

-- 4. Create trigger for updated_at
DROP TRIGGER IF EXISTS update_cleaner_jobs_updated_at ON public.cleaner_jobs;
CREATE TRIGGER update_cleaner_jobs_updated_at BEFORE UPDATE ON public.cleaner_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Create RLS policies for development/testing
CREATE POLICY "anyone_can_read_cleaner_jobs" ON public.cleaner_jobs
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_cleaner_jobs" ON public.cleaner_jobs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_cleaner_jobs" ON public.cleaner_jobs
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_delete_cleaner_jobs" ON public.cleaner_jobs
  FOR DELETE USING (auth.role() = 'authenticated');

-- 6. Add status constraint
ALTER TABLE public.cleaner_jobs
DROP CONSTRAINT IF EXISTS cleaner_jobs_status_check;

ALTER TABLE public.cleaner_jobs
ADD CONSTRAINT cleaner_jobs_status_check CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'));
