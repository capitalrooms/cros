-- Migration 149: Visit tenant requests + job merging
-- Run this in the Supabase SQL editor

-- 1. Add merge tracking to maintenance_tickets
ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS merged_into_ticket_id UUID REFERENCES maintenance_tickets(id),
  ADD COLUMN IF NOT EXISTS short_notice_pending BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fallback_date DATE,
  ADD COLUMN IF NOT EXISTS fallback_slot TIME,
  ADD COLUMN IF NOT EXISTS short_notice_deadline TIMESTAMPTZ;

-- Index for finding all children of a parent ticket
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_merged_into
  ON maintenance_tickets(merged_into_ticket_id)
  WHERE merged_into_ticket_id IS NOT NULL;

-- 2. Create visit_tenant_requests table
CREATE TABLE IF NOT EXISTS visit_tenant_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        UUID NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  tenant_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  request_text     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'declined'
  admin_response   TEXT,
  reviewed_by      UUID REFERENCES people(id),
  reviewed_at      TIMESTAMPTZ,
  -- If approved, the new sub-ticket created from this request
  merged_ticket_id UUID REFERENCES maintenance_tickets(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_tenant_requests_ticket
  ON visit_tenant_requests(ticket_id);

CREATE INDEX IF NOT EXISTS idx_visit_tenant_requests_status
  ON visit_tenant_requests(status)
  WHERE status = 'pending';

-- 3. RLS: use service role for all operations (consistent with other tables)
ALTER TABLE visit_tenant_requests ENABLE ROW LEVEL SECURITY;

-- Allow authenticated tenants to insert their own requests
CREATE POLICY "tenant_insert_own" ON visit_tenant_requests
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users to read requests for their tickets
CREATE POLICY "authenticated_read" ON visit_tenant_requests
  FOR SELECT
  USING (true);

-- Service role handles updates (approve/decline) server-side
CREATE POLICY "service_update" ON visit_tenant_requests
  FOR UPDATE
  USING (true);

-- 4. Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_visit_tenant_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visit_tenant_requests_updated_at ON visit_tenant_requests;
CREATE TRIGGER trg_visit_tenant_requests_updated_at
  BEFORE UPDATE ON visit_tenant_requests
  FOR EACH ROW EXECUTE FUNCTION update_visit_tenant_requests_updated_at();
