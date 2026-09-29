-- Add tenancy_id FK to property_documents so tenancy agreements and deposit
-- certificates can be linked to the specific tenancy they belong to.
-- This makes documents discoverable per tenancy rather than just per property.

ALTER TABLE public.property_documents
  ADD COLUMN IF NOT EXISTS tenancy_id UUID REFERENCES public.tenancies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_property_documents_tenancy_id
  ON public.property_documents(tenancy_id)
  WHERE tenancy_id IS NOT NULL;
