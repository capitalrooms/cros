-- Create tenancies table to track tenant-room assignments and communication preferences
CREATE TABLE IF NOT EXISTS tenancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  rent_monthly NUMERIC(10,2),

  -- Communication preferences
  communication_preference VARCHAR(50) DEFAULT 'email',
  opt_in_maintenance BOOLEAN DEFAULT true,
  opt_in_viewings BOOLEAN DEFAULT false,
  opt_in_appointments BOOLEAN DEFAULT true,
  opt_in_cleaning BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenancies_room_id ON tenancies(room_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_tenant_id ON tenancies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_active ON tenancies(end_date) WHERE end_date IS NULL OR end_date >= CURRENT_DATE;

-- RLS: Tenants can view their own tenancies; admin/landlord can view all
ALTER TABLE tenancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenancies_tenant_read" ON tenancies
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM people WHERE id = tenant_id
    )
    OR (
      SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()
    ) IN ('administrator', 'landlord', 'admin')
  );

CREATE POLICY "tenancies_admin_all" ON tenancies
  FOR ALL
  USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) IN ('administrator', 'landlord', 'admin')
  );
