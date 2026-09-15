-- Applicant document store: files uploaded manually by admin during referencing
-- AI scans each doc and merges extracted data into applicant_profile

CREATE TABLE IF NOT EXISTS public.applicant_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  UUID NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  file_name     VARCHAR(255) NOT NULL,
  file_url      TEXT NOT NULL,          -- public Supabase storage URL
  storage_path  TEXT,                   -- path in property-documents bucket
  mime_type     VARCHAR(100),
  doc_type      VARCHAR(80),            -- from AI classify: payslip, bank_statement, id_document, etc.
  ai_summary    TEXT,                   -- one-line AI summary of the document
  ai_data       JSONB DEFAULT '{}',     -- full extracted fields from classifyDocument()
  uploaded_by   UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applicant_docs_applicant ON public.applicant_documents(applicant_id);

ALTER TABLE public.applicant_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='applicant_documents' AND policyname='admin_all_applicant_docs') THEN
    CREATE POLICY "admin_all_applicant_docs" ON public.applicant_documents FOR ALL
      USING (EXISTS (SELECT 1 FROM public.people WHERE people.email = auth.jwt()->>'email' AND people.role IN ('administrator','admin','lettings')));
  END IF;
END $$;

-- Add profile column to applicants if missing
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS applicant_profile JSONB DEFAULT '{}';
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
