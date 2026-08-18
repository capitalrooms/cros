-- Property documents table for storing evacuation plans, emergency contacts, house rules, etc.
-- Admins upload these documents, tenants can view them organized by type

CREATE TABLE IF NOT EXISTS public.property_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- 'evacuation_plan', 'emergency_contacts', 'house_rules', 'safety_info', 'utility_info', 'policies'
  file_name VARCHAR(255) NOT NULL,
  storage_url TEXT NOT NULL, -- URL to the document in Supabase storage
  file_size INTEGER,
  description TEXT,
  uploaded_by UUID REFERENCES public.people(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_property_documents_property_id ON public.property_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_property_documents_type ON public.property_documents(property_id, document_type);
CREATE INDEX IF NOT EXISTS idx_property_documents_uploaded_at ON public.property_documents(uploaded_at DESC);

-- RLS: Tenants can read documents for their assigned property
ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_read_property_docs" ON public.property_documents
  FOR SELECT USING (
    property_id = (
      SELECT property_id FROM public.people
      WHERE id = auth.uid()
    )
  );

-- RLS: Only admins can insert/update/delete
CREATE POLICY "admins_manage_property_docs" ON public.property_documents
  FOR ALL USING (
    (SELECT role FROM public.people WHERE id = auth.uid()) = 'administrator'
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_property_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_property_documents_updated_at ON public.property_documents;
CREATE TRIGGER update_property_documents_updated_at
  BEFORE UPDATE ON public.property_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_property_documents_updated_at();
