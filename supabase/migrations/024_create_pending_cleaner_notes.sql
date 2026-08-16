-- Create Pending Cleaner Notes Table
-- Stores notes for cleaners when no clean is currently scheduled
-- These notes are automatically attached to the next clean booked at each property

-- 1. Create pending_cleaner_notes table
CREATE TABLE IF NOT EXISTS public.pending_cleaner_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attached_to_clean_id UUID REFERENCES public.cleans(id) ON DELETE SET NULL,
  attached_at TIMESTAMP WITH TIME ZONE
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pending_cleaner_notes_property_id ON public.pending_cleaner_notes(property_id);
CREATE INDEX IF NOT EXISTS idx_pending_cleaner_notes_attached ON public.pending_cleaner_notes(attached_to_clean_id) WHERE attached_to_clean_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_pending_cleaner_notes_created_at ON public.pending_cleaner_notes(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.pending_cleaner_notes ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for development/testing
CREATE POLICY "anyone_can_read_pending_cleaner_notes" ON public.pending_cleaner_notes
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_pending_cleaner_notes" ON public.pending_cleaner_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_pending_cleaner_notes" ON public.pending_cleaner_notes
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_delete_pending_cleaner_notes" ON public.pending_cleaner_notes
  FOR DELETE USING (auth.role() = 'authenticated');
