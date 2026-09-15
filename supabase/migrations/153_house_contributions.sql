-- Migration 153: House contributions
-- Tenants can log purchases/contributions they've made for the house.
-- No leaderboard — personal tally + shared history only.

CREATE TABLE IF NOT EXISTS house_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(8, 2),                          -- optional £ amount
  category VARCHAR(100) NOT NULL DEFAULT 'other', -- cleaning_supplies | food | household | repair | garden | other
  receipt_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contributions_property ON house_contributions(property_id);
CREATE INDEX idx_contributions_person ON house_contributions(person_id);
CREATE INDEX idx_contributions_created ON house_contributions(created_at DESC);

-- RLS
ALTER TABLE house_contributions ENABLE ROW LEVEL SECURITY;

-- Tenant can see all contributions for their property (shared history)
CREATE POLICY "tenant view property contributions" ON house_contributions
  FOR SELECT USING (
    property_id IN (
      SELECT t.property_id FROM tenancies t
      JOIN people p ON p.id = t.person_id
      WHERE p.email = (auth.jwt()->>'email')
      AND t.status = 'active'
    )
  );

-- Tenant can insert their own
CREATE POLICY "tenant insert own contribution" ON house_contributions
  FOR INSERT WITH CHECK (
    person_id IN (
      SELECT id FROM people WHERE email = (auth.jwt()->>'email')
    )
  );

-- Admin can see all
CREATE POLICY "admin all contributions" ON house_contributions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE email = (auth.jwt()->>'email')
      AND role IN ('administrator', 'admin')
    )
  );
