-- Migration 068: Create communications log for tenancy-specific contact history
-- Tracks all communications with a tenant (emails, messages, notes, calls)

CREATE TABLE IF NOT EXISTS public.communications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Communication details
  communication_type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'call', 'note', 'message'
  subject VARCHAR(255),
  content TEXT NOT NULL,
  direction VARCHAR(20), -- 'inbound', 'outbound', 'internal_note'

  -- Participants
  from_person_id UUID REFERENCES public.people(id),
  to_person_id UUID REFERENCES public.people(id),

  -- Status
  status VARCHAR(50) DEFAULT 'logged', -- 'logged', 'requires_action', 'resolved'

  -- Metadata
  external_ref VARCHAR(255), -- Reference ID from email system, SMS gateway, etc.
  tags TEXT[], -- Array of tags for filtering

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_communications_tenancy_id ON public.communications_log(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_communications_room_id ON public.communications_log(room_id);
CREATE INDEX IF NOT EXISTS idx_communications_property_id ON public.communications_log(property_id);
CREATE INDEX IF NOT EXISTS idx_communications_created_at ON public.communications_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communications_type ON public.communications_log(communication_type);
CREATE INDEX IF NOT EXISTS idx_communications_status ON public.communications_log(status);

-- Enable RLS
ALTER TABLE public.communications_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "anyone_can_read_communications_log" ON public.communications_log
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_communications_log" ON public.communications_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_communications_log" ON public.communications_log
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_communications_log_updated_at BEFORE UPDATE ON public.communications_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
