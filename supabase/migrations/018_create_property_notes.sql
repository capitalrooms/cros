-- Create property notes table for cleaner notes, agent notes, admin updates
-- Visible on tenant dashboard; editable/deletable by cleaner, agent, or admin only

CREATE TABLE IF NOT EXISTS public.property_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  note_type VARCHAR(50) NOT NULL CHECK (note_type IN ('cleaner', 'agent', 'admin')),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,

  -- For soft deletion / archiving
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT fk_property_notes_property FOREIGN KEY (property_id) REFERENCES public.properties(id)
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_property_notes_property_id
ON public.property_notes(property_id);

CREATE INDEX IF NOT EXISTS idx_property_notes_type
ON public.property_notes(note_type);

CREATE INDEX IF NOT EXISTS idx_property_notes_created_at
ON public.property_notes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_notes_not_deleted
ON public.property_notes(is_deleted) WHERE is_deleted = false;

-- RLS: Anyone with access to the property can read notes (tenants see them on dashboard)
ALTER TABLE public.property_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_notes_read"
  ON public.property_notes FOR SELECT
  USING (true);

-- Only the person who created the note (or admin) can delete/update
CREATE POLICY "property_notes_write"
  ON public.property_notes FOR UPDATE
  USING (auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM public.people WHERE id = auth.uid() AND role = 'administrator'
  ));

CREATE POLICY "property_notes_delete"
  ON public.property_notes FOR DELETE
  USING (auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM public.people WHERE id = auth.uid() AND role = 'administrator'
  ));

CREATE POLICY "property_notes_insert"
  ON public.property_notes FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND EXISTS (
      SELECT 1 FROM public.people
      WHERE id = auth.uid()
      AND role IN ('cleaner', 'agent', 'administrator')
    )
  );
