-- Create property_appointments table for admin to book visits/inspections/etc.

CREATE TABLE property_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  appointment_type VARCHAR(50) NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL DEFAULT '15:00',
  duration_minutes INTEGER DEFAULT 30, -- e.g., 15, 30, 60, 120
  visitor_name VARCHAR(255) NOT NULL,
  visitor_company VARCHAR(255),
  visitor_phone VARCHAR(20),
  notes TEXT,
  notify_tenants BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES people(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_property_appointments_property_id ON property_appointments(property_id);
CREATE INDEX idx_property_appointments_date ON property_appointments(appointment_date DESC);
CREATE INDEX idx_property_appointments_type ON property_appointments(appointment_type);

-- Enable RLS
ALTER TABLE property_appointments ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can do everything
CREATE POLICY "admin_all_appointments" ON property_appointments
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.id = auth.uid()
        AND p.assignment->>'role' IN ('administrator', 'admin')
    )
  );

-- RLS: Tenants can view appointments for their property (read-only)
CREATE POLICY "tenant_view_appointments" ON property_appointments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN rooms r ON r.id = t.room_id
      WHERE r.property_id = property_appointments.property_id
        AND t.tenant_id = auth.uid()
        AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
    )
  );
