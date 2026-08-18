-- Migration 039: Tenant Acknowledgment Notes (Requires Explicit Confirmation)

CREATE TABLE IF NOT EXISTS public.tenant_acknowledgment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  tenancy_id UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.people(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),

  -- Acknowledgment tracking
  acknowledged_by UUID REFERENCES public.people(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,

  -- Internal admin notes (never shown to tenant)
  internal_note TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'acknowledged', 'filed'

  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_tenancy_id ON public.tenant_acknowledgment_notes(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_property_id ON public.tenant_acknowledgment_notes(property_id);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_room_id ON public.tenant_acknowledgment_notes(room_id);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_status ON public.tenant_acknowledgment_notes(status);
CREATE INDEX IF NOT EXISTS idx_tenant_ack_notes_expires_at ON public.tenant_acknowledgment_notes(expires_at DESC);

ALTER TABLE public.tenant_acknowledgment_notes ENABLE ROW LEVEL SECURITY;

-- Tenants can view notes targeted at them
CREATE POLICY "Tenants can view their acknowledgment notes" ON public.tenant_acknowledgment_notes FOR SELECT
USING (
  tenancy_id IN (
    SELECT id FROM public.tenancies
    WHERE tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid())
  )
  AND status != 'filed' -- Don't show filed notes to tenants
);

-- Tenants can update acknowledgment
CREATE POLICY "Tenants can acknowledge notes" ON public.tenant_acknowledgment_notes FOR UPDATE
USING (
  tenancy_id IN (
    SELECT id FROM public.tenancies
    WHERE tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid())
  )
)
WITH CHECK (
  tenancy_id IN (
    SELECT id FROM public.tenancies
    WHERE tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid())
  )
  AND status IN ('active', 'acknowledged') -- Can only update active notes
);

-- Admin can view, create, and manage all notes (including after filing)
CREATE POLICY "Admin can view all acknowledgment notes" ON public.tenant_acknowledgment_notes FOR SELECT
USING ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'));

CREATE POLICY "Admin can create acknowledgment notes" ON public.tenant_acknowledgment_notes FOR INSERT
WITH CHECK ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'));

CREATE POLICY "Admin can manage acknowledgment notes" ON public.tenant_acknowledgment_notes FOR UPDATE
USING ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'))
WITH CHECK ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'));
