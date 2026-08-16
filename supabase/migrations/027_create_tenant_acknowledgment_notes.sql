-- Create tenant acknowledgment notes that require active confirmation

CREATE TABLE IF NOT EXISTS tenant_acknowledgment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES people(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Acknowledgment tracking
  acknowledged_by UUID REFERENCES people(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  photo_required BOOLEAN DEFAULT false,
  photo_attachment_id UUID REFERENCES attachments(id),
  
  -- Internal "karma" tracking (never shown to tenant)
  internal_note TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'acknowledged', 'filed'
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_acknowledgment_notes_tenancy_id
  ON tenant_acknowledgment_notes(tenancy_id);

CREATE INDEX IF NOT EXISTS idx_acknowledgment_notes_room_id
  ON tenant_acknowledgment_notes(room_id);

CREATE INDEX IF NOT EXISTS idx_acknowledgment_notes_status
  ON tenant_acknowledgment_notes(status, expires_at);

-- RLS: Tenants see only active notes for their room (without internal_note); admins see all
ALTER TABLE tenant_acknowledgment_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acknowledgment_notes_tenant_read_active" ON tenant_acknowledgment_notes
  FOR SELECT
  USING (
    (status = 'active' OR acknowledged_by = (SELECT id FROM people WHERE user_id = auth.uid()))
    AND room_id IN (
      SELECT room_id FROM tenancies WHERE tenant_id = (
        SELECT id FROM people WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "acknowledgment_notes_tenant_update_own" ON tenant_acknowledgment_notes
  FOR UPDATE
  USING (
    room_id IN (
      SELECT room_id FROM tenancies WHERE tenant_id = (
        SELECT id FROM people WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "acknowledgment_notes_admin_all" ON tenant_acknowledgment_notes
  FOR ALL
  USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) IN ('administrator', 'admin')
  );
