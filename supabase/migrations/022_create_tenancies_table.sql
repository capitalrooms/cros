-- Create Tenancies Table
-- Tracks tenant occupancy of rooms with communication preferences

-- 1. Create tenancies table
CREATE TABLE IF NOT EXISTS public.tenancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  rent_monthly NUMERIC(10, 2),

  -- Communication preferences (from migration 017)
  communication_preference VARCHAR(20) DEFAULT 'email',
  opt_in_maintenance BOOLEAN DEFAULT true,
  opt_in_viewings BOOLEAN DEFAULT false,
  opt_in_appointments BOOLEAN DEFAULT true,
  opt_in_cleaning BOOLEAN DEFAULT true,

  -- Status tracking
  status VARCHAR(50) DEFAULT 'active',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenancies_room_id ON public.tenancies(room_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_tenant_id ON public.tenancies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_active ON public.tenancies(end_date) WHERE end_date IS NULL OR end_date >= CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_tenancies_communication_preference ON public.tenancies(communication_preference);
CREATE INDEX IF NOT EXISTS idx_tenancies_opt_ins ON public.tenancies(opt_in_maintenance, opt_in_viewings, opt_in_appointments, opt_in_cleaning);

-- 3. Enable RLS
ALTER TABLE public.tenancies ENABLE ROW LEVEL SECURITY;

-- 4. Create trigger for updated_at
DROP TRIGGER IF EXISTS update_tenancies_updated_at ON public.tenancies;
CREATE TRIGGER update_tenancies_updated_at BEFORE UPDATE ON public.tenancies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Create RLS policies for development/testing
CREATE POLICY "anyone_can_read_tenancies" ON public.tenancies
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_tenancies" ON public.tenancies
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_tenancies" ON public.tenancies
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 6. Add constraints
ALTER TABLE public.tenancies
DROP CONSTRAINT IF EXISTS tenancies_communication_preference_check;

ALTER TABLE public.tenancies
ADD CONSTRAINT tenancies_communication_preference_check
CHECK (communication_preference IN ('email', 'text'));

ALTER TABLE public.tenancies
DROP CONSTRAINT IF EXISTS tenancies_status_check;

ALTER TABLE public.tenancies
ADD CONSTRAINT tenancies_status_check
CHECK (status IN ('active', 'on_notice', 'completed'));
