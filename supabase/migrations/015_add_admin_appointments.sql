-- Add Admin Appointments System
-- Enables admin users to schedule their own property visits and notify tenants

-- 1. Create admin_appointments table
CREATE TABLE IF NOT EXISTS public.admin_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  appointment_slot VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  appointment_type VARCHAR(50) DEFAULT 'property_visit',
  notify_tenants BOOLEAN DEFAULT true,
  notifications_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_admin_appointments_property ON public.admin_appointments(property_id);
CREATE INDEX IF NOT EXISTS idx_admin_appointments_room ON public.admin_appointments(room_id);
CREATE INDEX IF NOT EXISTS idx_admin_appointments_admin ON public.admin_appointments(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_appointments_date ON public.admin_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_admin_appointments_type ON public.admin_appointments(appointment_type);

-- 3. Enable RLS
ALTER TABLE public.admin_appointments ENABLE ROW LEVEL SECURITY;

-- 4. Create trigger for updated_at
DROP TRIGGER IF EXISTS update_admin_appointments_updated_at ON public.admin_appointments;
CREATE TRIGGER update_admin_appointments_updated_at BEFORE UPDATE ON public.admin_appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Create RLS policies for development/testing
CREATE POLICY "anyone_can_read_admin_appointments" ON public.admin_appointments
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_admin_appointments" ON public.admin_appointments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_admin_appointments" ON public.admin_appointments
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_delete_admin_appointments" ON public.admin_appointments
  FOR DELETE USING (auth.role() = 'authenticated');

-- 6. Add appointment_type constraint
ALTER TABLE public.admin_appointments
DROP CONSTRAINT IF EXISTS admin_appointments_type_check;

ALTER TABLE public.admin_appointments
ADD CONSTRAINT admin_appointments_type_check CHECK (appointment_type IN ('property_visit', 'inspection', 'meeting', 'maintenance_oversight', 'other'));
