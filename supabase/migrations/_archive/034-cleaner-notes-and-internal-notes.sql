-- Migration 034: Cleaner notes (auto-attach) + Internal admin notes (property & lettings)
-- Enables admin to add notes for cleaners without a clean booked
-- Adds internal-only notes not visible to tenants
-- Auto-attaches pending cleaner notes when clean is booked

-- Create pending_cleaner_notes table
-- Admin can add notes ahead of time, they auto-attach when clean is booked
CREATE TABLE IF NOT EXISTS public.pending_cleaner_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.people(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attached_to_clean_id UUID REFERENCES public.cleans(id) ON DELETE SET NULL,
  attached_at TIMESTAMP WITH TIME ZONE
);

-- Add is_internal flag to property_notes table
ALTER TABLE public.property_notes ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- Create lettings_lead_notes table for internal notes on leads
CREATE TABLE IF NOT EXISTS public.lettings_lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lettings_lead_id UUID, -- Reference to leads (exact table TBD based on schema)
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  viewing_id UUID, -- Can also be linked to viewing
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.people(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger to auto-attach pending cleaner notes when clean is booked
CREATE OR REPLACE FUNCTION attach_pending_cleaner_notes()
RETURNS TRIGGER AS $$
BEGIN
  -- Find all pending notes for this property
  UPDATE public.pending_cleaner_notes
  SET attached_to_clean_id = NEW.id,
      attached_at = NOW()
  WHERE property_id = NEW.property_id
    AND attached_to_clean_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on cleans table
DROP TRIGGER IF EXISTS attach_pending_notes_trigger ON public.cleans;
CREATE TRIGGER attach_pending_notes_trigger
AFTER INSERT ON public.cleans
FOR EACH ROW
EXECUTE FUNCTION attach_pending_cleaner_notes();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pending_cleaner_notes_property_id ON public.pending_cleaner_notes(property_id);
CREATE INDEX IF NOT EXISTS idx_pending_cleaner_notes_attached_clean ON public.pending_cleaner_notes(attached_to_clean_id);
CREATE INDEX IF NOT EXISTS idx_property_notes_is_internal ON public.property_notes(is_internal);
CREATE INDEX IF NOT EXISTS idx_lettings_lead_notes_property_id ON public.lettings_lead_notes(property_id);
CREATE INDEX IF NOT EXISTS idx_lettings_lead_notes_viewing_id ON public.lettings_lead_notes(viewing_id);

-- RLS Policies

ALTER TABLE public.pending_cleaner_notes ENABLE ROW LEVEL SECURITY;

-- Admin can create and view pending cleaner notes
CREATE POLICY "Admin can create pending cleaner notes"
  ON public.pending_cleaner_notes FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  );

CREATE POLICY "Admin can view pending cleaner notes"
  ON public.pending_cleaner_notes FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord')
  );

CREATE POLICY "Admin can delete pending cleaner notes"
  ON public.pending_cleaner_notes FOR DELETE
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  );

-- Cleaners can view attached notes on their jobs
CREATE POLICY "Cleaners can view attached notes on their cleans"
  ON public.pending_cleaner_notes FOR SELECT
  USING (
    attached_to_clean_id IN (
      SELECT id FROM public.cleans
      WHERE cleaner_id = (
        SELECT id FROM public.people WHERE auth_id = auth.uid()
      )
    )
  );

ALTER TABLE public.lettings_lead_notes ENABLE ROW LEVEL SECURITY;

-- Admin can create and view lettings lead notes
CREATE POLICY "Admin can create lettings lead notes"
  ON public.lettings_lead_notes FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  );

CREATE POLICY "Admin can view lettings lead notes"
  ON public.lettings_lead_notes FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord', 'lettings')
  );

CREATE POLICY "Admin can update lettings lead notes"
  ON public.lettings_lead_notes FOR UPDATE
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  );

-- Update property_notes RLS to enforce internal note visibility
DROP POLICY IF EXISTS "Tenants can view public property notes" ON public.property_notes;

-- Tenants can only view non-internal notes
CREATE POLICY "Tenants can view public property notes"
  ON public.property_notes FOR SELECT
  USING (
    (is_internal = false AND room_id IS NULL)
    OR (is_internal = false AND room_id IN (
      SELECT room_id FROM public.tenancies
      WHERE tenant_id = (
        SELECT id FROM public.people WHERE auth_id = auth.uid()
      )
    ))
  );

-- Admin can view all property notes (internal + public)
DROP POLICY IF EXISTS "Admin can view all property notes" ON public.property_notes;

CREATE POLICY "Admin can view all property notes"
  ON public.property_notes FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord')
  );

-- Cleaner can only view notes marked for them (non-internal)
DROP POLICY IF EXISTS "Cleaners can view their assigned notes" ON public.property_notes;

CREATE POLICY "Cleaners can view assigned notes"
  ON public.property_notes FOR SELECT
  USING (
    note_type = 'cleaner' AND is_internal = false
  );
