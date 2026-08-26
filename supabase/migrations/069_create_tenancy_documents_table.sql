-- Migration 069: Create tenancy documents table
-- Stores tenancy-specific documents (agreements, certificates, references)

CREATE TABLE IF NOT EXISTS public.tenancy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Document details
  document_type VARCHAR(50) NOT NULL, -- 'agreement', 'deposit_certificate', 'referencing_report', 'id_proof', 'employment_letter', 'other'
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  storage_path VARCHAR(255),
  file_size INTEGER, -- Size in bytes
  file_type VARCHAR(50), -- 'pdf', 'image', 'document'

  -- Status
  status VARCHAR(50) DEFAULT 'uploaded', -- 'uploaded', 'verified', 'pending_review', 'rejected'
  review_notes TEXT,
  reviewed_by UUID REFERENCES public.people(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,

  -- Source
  uploaded_by UUID REFERENCES public.people(id),
  auto_populated_from VARCHAR(255), -- e.g., 'referencing_report_id'

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenancy_documents_tenancy_id ON public.tenancy_documents(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_documents_room_id ON public.tenancy_documents(room_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_documents_property_id ON public.tenancy_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_documents_type ON public.tenancy_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_tenancy_documents_status ON public.tenancy_documents(status);
CREATE INDEX IF NOT EXISTS idx_tenancy_documents_created_at ON public.tenancy_documents(created_at DESC);

-- Enable RLS
ALTER TABLE public.tenancy_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "anyone_can_read_tenancy_documents" ON public.tenancy_documents
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_tenancy_documents" ON public.tenancy_documents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_tenancy_documents" ON public.tenancy_documents
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_tenancy_documents_updated_at BEFORE UPDATE ON public.tenancy_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
