-- Migration 150: Cleaner extras requests
-- Tenants can request specific cleaning tasks when a cleaner is booked.

CREATE TABLE IF NOT EXISTS cleaner_extras_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clean_id UUID NOT NULL REFERENCES cleans(id) ON DELETE CASCADE,
  tenant_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  tasks TEXT[] NOT NULL DEFAULT '{}',  -- array of selected task labels
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending | acknowledged | done | declined
  admin_response TEXT,
  reviewed_by UUID REFERENCES people(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_cleaner_extras_clean_id ON cleaner_extras_requests(clean_id);
CREATE INDEX idx_cleaner_extras_tenant ON cleaner_extras_requests(tenant_person_id);

-- RLS
ALTER TABLE cleaner_extras_requests ENABLE ROW LEVEL SECURITY;

-- Tenant can see their own requests
CREATE POLICY "tenant own cleaner extras" ON cleaner_extras_requests
  FOR ALL USING (
    tenant_person_id IN (
      SELECT id FROM people WHERE email = (auth.jwt()->>'email')
    )
  );

-- Admin / staff can see all
CREATE POLICY "admin cleaner extras" ON cleaner_extras_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE email = (auth.jwt()->>'email')
      AND role IN ('administrator', 'admin', 'cleaner')
    )
  );
