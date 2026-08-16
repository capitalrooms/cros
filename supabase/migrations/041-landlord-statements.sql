-- Landlord statement tables for clean data display
-- Stores statements imported from accounting system

CREATE TABLE landlord_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- Statement metadata
  statement_reference VARCHAR(50) NOT NULL, -- LS1001, LS1002, etc.
  statement_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Summary totals
  gross_rent NUMERIC(10,2) NOT NULL DEFAULT 0,
  management_fees NUMERIC(10,2) NOT NULL DEFAULT 0,
  property_charges NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_to_landlord NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Payment info
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_date DATE,

  -- Source tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(landlord_id, property_id, statement_reference)
);

-- Per-room rent breakdown
CREATE TABLE landlord_statement_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES landlord_statements(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES people(id),
  tenant_name VARCHAR(255) NOT NULL,

  rent_income NUMERIC(10,2) NOT NULL,
  management_fee NUMERIC(10,2) NOT NULL,
  net_to_landlord NUMERIC(10,2) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Property-level charges/deductions
CREATE TABLE landlord_statement_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES landlord_statements(id) ON DELETE CASCADE,

  description VARCHAR(255) NOT NULL, -- Netflix, Cleaning, Broadband, etc.
  category VARCHAR(50), -- subscriptions, maintenance, utilities, other
  amount NUMERIC(10,2) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_landlord_statements_landlord ON landlord_statements(landlord_id, statement_date DESC);
CREATE INDEX idx_landlord_statements_property ON landlord_statements(property_id, statement_date DESC);
CREATE INDEX idx_landlord_statement_rooms_statement ON landlord_statement_rooms(statement_id);
CREATE INDEX idx_landlord_statement_charges_statement ON landlord_statement_charges(statement_id);

-- RLS Policies
ALTER TABLE landlord_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlord_statement_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlord_statement_charges ENABLE ROW LEVEL SECURITY;

-- Landlords can only see their own statements
CREATE POLICY landlord_statements_read ON landlord_statements
  FOR SELECT
  USING (landlord_id = (SELECT id FROM people WHERE auth_id = auth.uid()));

CREATE POLICY landlord_statements_insert ON landlord_statements
  FOR INSERT
  WITH CHECK (
    -- Only admin or system can insert
    (SELECT role FROM people WHERE auth_id = auth.uid()) IN ('admin', 'system')
  );

-- Landlords can read room details from their statements
CREATE POLICY landlord_statement_rooms_read ON landlord_statement_rooms
  FOR SELECT
  USING (
    statement_id IN (
      SELECT id FROM landlord_statements
      WHERE landlord_id = (SELECT id FROM people WHERE auth_id = auth.uid())
    )
  );

-- Landlords can read charges from their statements
CREATE POLICY landlord_statement_charges_read ON landlord_statement_charges
  FOR SELECT
  USING (
    statement_id IN (
      SELECT id FROM landlord_statements
      WHERE landlord_id = (SELECT id FROM people WHERE auth_id = auth.uid())
    )
  );
