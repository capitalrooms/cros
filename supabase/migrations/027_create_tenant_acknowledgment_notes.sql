-- Create Tenant Acknowledgment Notes Table
-- For notes that require active tenant confirmation or photo evidence
-- Auto-files after 7 days if not acknowledged
-- Includes internal admin tracking (never shown to tenant)

-- 1. Create tenant_acknowledgment_notes table
CREATE TABLE IF NOT EXISTS public.tenant_acknowledgment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  tenancy_id UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),

  -- Acknowledgment tracking
  acknowledged_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  photo_required BOOLEAN DEFAULT false,
  photo_attachment_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,

  -- Internal admin tracking (never shown to tenant)
  internal_note TEXT,
  internal_note_indexed TSVECTOR, -- For full-text search

  -- Status tracking
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'acknowledged', 'filed'
  filed_at TIMESTAMP WITH TIME ZONE
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_tenancy_id
  ON public.tenant_acknowledgment_notes(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_room_id
  ON public.tenant_acknowledgment_notes(room_id);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_property_id
  ON public.tenant_acknowledgment_notes(property_id);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_status
  ON public.tenant_acknowledgment_notes(status);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_created_at
  ON public.tenant_acknowledgment_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_expires_at
  ON public.tenant_acknowledgment_notes(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_active
  ON public.tenant_acknowledgment_notes(tenancy_id, status) WHERE status = 'active';

-- 3. Create full-text search index on internal notes (for searchability)
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_internal_search
  ON public.tenant_acknowledgment_notes USING GIN(internal_note_indexed);

-- 4. Enable RLS
ALTER TABLE public.tenant_acknowledgment_notes ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for development/testing
CREATE POLICY "anyone_can_read_ack_notes" ON public.tenant_acknowledgment_notes
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_ack_notes" ON public.tenant_acknowledgment_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_ack_notes" ON public.tenant_acknowledgment_notes
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 6. Add constraints
ALTER TABLE public.tenant_acknowledgment_notes
DROP CONSTRAINT IF EXISTS tenant_ack_notes_status_check;

ALTER TABLE public.tenant_acknowledgment_notes
ADD CONSTRAINT tenant_ack_notes_status_check
CHECK (status IN ('active', 'acknowledged', 'filed'));

-- 7. Create function to update internal_note_indexed column on insert/update
CREATE OR REPLACE FUNCTION update_internal_note_search()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.internal_note IS NOT NULL THEN
    NEW.internal_note_indexed := to_tsvector('english', NEW.internal_note);
  ELSE
    NEW.internal_note_indexed := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger to update search index
DROP TRIGGER IF EXISTS trigger_update_internal_note_search ON public.tenant_acknowledgment_notes;
CREATE TRIGGER trigger_update_internal_note_search
BEFORE INSERT OR UPDATE ON public.tenant_acknowledgment_notes
FOR EACH ROW EXECUTE FUNCTION update_internal_note_search();
