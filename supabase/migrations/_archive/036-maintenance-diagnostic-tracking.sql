-- Migration 036: Maintenance Diagnostic Tracking
-- Tracks AI-powered troubleshooting attempts for A/B testing

CREATE TABLE IF NOT EXISTS public.maintenance_diagnostic_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  tenancy_id UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL, -- 'plumbing', 'electrical', 'heating', etc.
  initial_description TEXT NOT NULL,
  ai_questions JSONB, -- Array of questions asked by AI
  user_answers JSONB, -- Array of answers provided by tenant
  ai_recommendation VARCHAR(50), -- 'diy', 'maybe_diy', 'professional_needed'
  ai_guidance TEXT, -- DIY instructions or professional reasoning
  user_choice VARCHAR(50), -- 'try_diy', 'escalate_to_pro'
  maintenance_ticket_id UUID REFERENCES public.maintenance_tickets(id) ON DELETE SET NULL,
  diy_attempted BOOLEAN DEFAULT false,
  diy_successful BOOLEAN, -- null=not attempted, true=worked, false=escalated
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for tracking metrics
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_tenant_id ON public.maintenance_diagnostic_attempts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_property_id ON public.maintenance_diagnostic_attempts(property_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_category ON public.maintenance_diagnostic_attempts(category);
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_recommendation ON public.maintenance_diagnostic_attempts(ai_recommendation);
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_user_choice ON public.maintenance_diagnostic_attempts(user_choice);
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_created_at ON public.maintenance_diagnostic_attempts(created_at);

-- RLS Policies
ALTER TABLE public.maintenance_diagnostic_attempts ENABLE ROW LEVEL SECURITY;

-- Tenants can view and create their own diagnostic attempts
CREATE POLICY "Tenants can view own diagnostic attempts" ON public.maintenance_diagnostic_attempts FOR SELECT
USING (tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid()));

CREATE POLICY "Tenants can create diagnostic attempts" ON public.maintenance_diagnostic_attempts FOR INSERT
WITH CHECK (tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid()));

CREATE POLICY "Tenants can update own diagnostic attempts" ON public.maintenance_diagnostic_attempts FOR UPDATE
USING (tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid()))
WITH CHECK (tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid()));

-- Admin can view all diagnostic attempts for analysis/A/B testing
CREATE POLICY "Admin can view all diagnostic attempts" ON public.maintenance_diagnostic_attempts FOR SELECT
USING ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord'));
