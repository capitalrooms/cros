-- Create admin_appointments table (015 was never applied to live DB)
-- All nullable columns — property_id optional for custom-address appointments.

CREATE TABLE IF NOT EXISTS public.admin_appointments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id             UUID REFERENCES public.people(id) ON DELETE CASCADE,
  property_id          UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id              UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  appointment_date     DATE NOT NULL,
  appointment_slot     VARCHAR(50),
  appointment_time     VARCHAR(50),
  title                VARCHAR(255),
  type                 VARCHAR(50),
  appointment_type     VARCHAR(50),
  description          TEXT,
  notes                TEXT,
  notification_message TEXT,
  custom_location      TEXT,
  notify_tenants       BOOLEAN DEFAULT true,
  notifications_sent   BOOLEAN DEFAULT false,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_appointments_property ON public.admin_appointments(property_id);
CREATE INDEX IF NOT EXISTS idx_admin_appointments_date     ON public.admin_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_admin_appointments_type     ON public.admin_appointments(type);

ALTER TABLE public.admin_appointments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_appointments' AND policyname = 'anyone_can_read_admin_appointments'
  ) THEN
    CREATE POLICY "anyone_can_read_admin_appointments"
      ON public.admin_appointments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_appointments' AND policyname = 'authenticated_can_insert_admin_appointments'
  ) THEN
    CREATE POLICY "authenticated_can_insert_admin_appointments"
      ON public.admin_appointments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_appointments' AND policyname = 'authenticated_can_update_admin_appointments'
  ) THEN
    CREATE POLICY "authenticated_can_update_admin_appointments"
      ON public.admin_appointments FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_appointments' AND policyname = 'authenticated_can_delete_admin_appointments'
  ) THEN
    CREATE POLICY "authenticated_can_delete_admin_appointments"
      ON public.admin_appointments FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;
