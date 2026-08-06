-- Enhance attachments table to support photo uploads with metadata
ALTER TABLE public.attachments
ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50) DEFAULT 'photo',
ADD COLUMN IF NOT EXISTS storage_url TEXT,
ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.people(id),
ADD COLUMN IF NOT EXISTS description TEXT;

-- Drop old uploader_id column if it exists and migrate to uploaded_by
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attachments' AND column_name = 'uploader_id') THEN
    UPDATE public.attachments SET uploaded_by = uploader_id WHERE uploaded_by IS NULL;
    ALTER TABLE public.attachments DROP COLUMN uploader_id;
  END IF;
END $$;

-- Rename file_type to better match
ALTER TABLE public.attachments
RENAME COLUMN file_type TO file_mime_type;

-- Create maintenance-photos storage bucket if it doesn't exist
-- Note: This is typically done through Supabase dashboard, but we document it here
-- INSERT INTO storage.buckets (id, name, owner, public)
-- VALUES ('maintenance-photos', 'maintenance-photos', NULL, true)
-- ON CONFLICT DO NOTHING;

-- RLS Policies for attachments table
-- Allow users to view attachments for their own tickets
CREATE POLICY "Users can view attachments for their tickets"
ON public.attachments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.maintenance_tickets mt
    WHERE mt.id = attachments.ticket_id
    AND (mt.reporter_id = auth.uid() OR mt.contractor_id = auth.uid())
  )
  OR
  EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.id = auth.uid() AND p.role = 'administrator'
  )
);

-- Allow users to insert attachments for their own tickets
CREATE POLICY "Users can upload attachments to their tickets"
ON public.attachments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.maintenance_tickets mt, public.people p
    WHERE mt.id = attachments.ticket_id
    AND p.id = auth.uid()
    AND (mt.reporter_id = auth.uid() OR p.role = 'administrator')
  )
);
