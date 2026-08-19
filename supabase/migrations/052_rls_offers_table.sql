-- RLS for offers table
-- Admins can insert offers
-- Applicants can read only their own offers (by token)

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can insert offers
CREATE POLICY "Admins can insert offers"
  ON offers
  FOR INSERT
  WITH CHECK (
    auth.jwt()->>'email' IN (
      SELECT email FROM people WHERE role = 'administrator'
    )
  );

-- Policy: Admins can read all offers
CREATE POLICY "Admins can read all offers"
  ON offers
  FOR SELECT
  USING (
    auth.jwt()->>'email' IN (
      SELECT email FROM people WHERE role = 'administrator'
    )
  );

-- Policy: Admins can update offers
CREATE POLICY "Admins can update offers"
  ON offers
  FOR UPDATE
  USING (
    auth.jwt()->>'email' IN (
      SELECT email FROM people WHERE role = 'administrator'
    )
  );
