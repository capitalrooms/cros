-- Documents uploaded for applicants before they become tenants.
-- At conversion (applicants → people), these are copied to property_documents
-- with person_id and tenancy_id set so they travel with the tenant.

CREATE TABLE IF NOT EXISTS public.applicant_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  UUID NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  doc_type      VARCHAR(100) NOT NULL,  -- matches TYPE_LABELS keys (tenant_reference, right_to_rent, etc.)
  file_name     VARCHAR(255) NOT NULL,
  storage_url   TEXT NOT NULL,
  description   TEXT,
  uploaded_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applicant_documents_applicant_id
  ON public.applicant_documents(applicant_id);

-- Admins only; applicants cannot see their own pre-tenancy docs here
ALTER TABLE public.applicant_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_applicant_docs" ON public.applicant_documents
  FOR ALL USING (
    (SELECT role FROM public.people WHERE email = auth.jwt()->>'email') IN ('administrator','lettings')
  );
