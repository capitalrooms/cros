-- 094_valuations_log.sql
-- Tracks every rental valuation letter generated through the admin tool.
-- Stores the PDF in Supabase Storage (bucket: valuations) and logs metadata here.

CREATE TABLE IF NOT EXISTS valuations_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL,          -- current_market | post_refurb | single_let | investment_analysis
  property_address TEXT NOT NULL,
  recipient_name   TEXT NOT NULL,
  letter_date      DATE,
  generated_by     UUID REFERENCES people(id) ON DELETE SET NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_storage_path TEXT,                   -- supabase storage path (valuations/<id>.pdf)
  room_count       INT,                    -- number of rooms in the valuation
  notes            TEXT                    -- optional internal note
);

CREATE INDEX idx_valuations_log_generated_at ON valuations_log(generated_at DESC);
CREATE INDEX idx_valuations_log_generated_by ON valuations_log(generated_by);

-- RLS: admins can do everything; others can only read their own
ALTER TABLE valuations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can manage valuations_log"
  ON valuations_log FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.email = auth.jwt()->>'email'
        AND people.role IN ('administrator', 'admin', 'lettings')
    )
  );
