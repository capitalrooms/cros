-- Create room_notes table for admin notes on available/upcoming rooms
CREATE TABLE IF NOT EXISTS room_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  note_type VARCHAR(50) DEFAULT 'admin_notes', -- 'admin_notes', 'lettings_notes', 'inspection_notes', etc.
  created_by UUID REFERENCES people(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_room_notes_room_id ON room_notes(room_id);
CREATE INDEX IF NOT EXISTS idx_room_notes_created_at ON room_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_notes_note_type ON room_notes(note_type);

-- Enable RLS
ALTER TABLE room_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can do anything
DROP POLICY IF EXISTS "Admins can manage room notes" ON room_notes;
CREATE POLICY "Admins can manage room notes" ON room_notes
  USING (auth.jwt()->>'email' IN (SELECT email FROM people WHERE role = 'administrator'))
  WITH CHECK (auth.jwt()->>'email' IN (SELECT email FROM people WHERE role = 'administrator'));

-- Lettings users can read notes
DROP POLICY IF EXISTS "Lettings users can read and create notes" ON room_notes;
CREATE POLICY "Lettings users can read and create notes" ON room_notes
  FOR SELECT
  USING (auth.jwt()->>'email' IN (SELECT email FROM people WHERE role IN ('administrator', 'lettings_user')));

-- Lettings users can create notes
DROP POLICY IF EXISTS "Lettings users can create notes" ON room_notes;
CREATE POLICY "Lettings users can create notes" ON room_notes
  FOR INSERT
  WITH CHECK (auth.jwt()->>'email' IN (SELECT email FROM people WHERE role IN ('administrator', 'lettings_user')));
