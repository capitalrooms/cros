-- Migration 174: property_policies table (standalone — no attachments FK)
-- Migration 053 likely failed because it referenced public.attachments which doesn't exist.
-- This creates the table without that dependency.

CREATE TABLE IF NOT EXISTS public.property_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  policy_type     VARCHAR(50) NOT NULL DEFAULT 'appliance', -- 'appliance' | 'building' | 'liability'
  appliance_type  VARCHAR(100),
  provider_name   VARCHAR(255) NOT NULL,
  policy_number   VARCHAR(100) NOT NULL,
  monthly_cost    NUMERIC(10,2) NOT NULL DEFAULT 0,
  renewal_date    DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_policies_property_id ON public.property_policies(property_id);
CREATE INDEX IF NOT EXISTS idx_property_policies_renewal_date ON public.property_policies(renewal_date);

ALTER TABLE public.property_policies ENABLE ROW LEVEL SECURITY;

-- Service-role bypass: API routes use service role key so no row-level check needed.
-- Staff with admin email can manage via service role API.
CREATE POLICY "admin_full_access_property_policies" ON public.property_policies
  FOR ALL USING (true) WITH CHECK (true);
