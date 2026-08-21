-- Create property-level cleaning notes table
-- Notes stick with the PROPERTY, not individual cleans
-- So if a clean is rescheduled, notes follow the actual next visit

CREATE TABLE IF NOT EXISTS public.property_cleaning_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,

  -- Cleaning context
  cleaning_type VARCHAR(50), -- 'deep_clean', 'spot_clean', 'kitchen_focus', etc
  note_title VARCHAR(255),
  note_content TEXT,

  -- Tracking
  created_by UUID NOT NULL REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Completion tracking
  completed_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  is_completed BOOLEAN DEFAULT FALSE,

  -- Soft delete
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_property_cleaning_notes_property_id
  ON public.property_cleaning_notes(property_id);
CREATE INDEX IF NOT EXISTS idx_property_cleaning_notes_incomplete
  ON public.property_cleaning_notes(property_id, is_completed, is_deleted)
  WHERE is_completed = false AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_property_cleaning_notes_created
  ON public.property_cleaning_notes(created_at DESC);

-- RLS Policies
ALTER TABLE public.property_cleaning_notes ENABLE ROW LEVEL SECURITY;

-- Admins can view, create, update cleaning notes
CREATE POLICY "Admins can manage cleaning notes"
  ON public.property_cleaning_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND (people.role = 'administrator' OR people.role = 'admin')
    )
  );

-- Cleaners can view incomplete notes for properties they work on
CREATE POLICY "Cleaners can view cleaning notes"
  ON public.property_cleaning_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND people.role = 'cleaner'
    )
    AND is_deleted = false
  );

-- Cleaners can mark notes as completed
CREATE POLICY "Cleaners can complete notes"
  ON public.property_cleaning_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND people.role = 'cleaner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND people.role = 'cleaner'
    )
  );
