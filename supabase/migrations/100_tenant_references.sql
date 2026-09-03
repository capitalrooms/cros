-- Tenant Reference Records
-- Stores full reference check data per tenant, linked to optional tenancy.
-- Separate from people so history is kept even if tenancy ends.

CREATE TABLE IF NOT EXISTS tenant_references (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  tenancy_id                 UUID REFERENCES tenancies(id),

  -- Source
  reference_source           TEXT,          -- e.g. 'Homeppl', 'OpenRent', 'manual'
  report_date                DATE,
  imported_by                UUID REFERENCES people(id),
  imported_at                TIMESTAMPTZ DEFAULT NOW(),

  -- Overall decision
  overall_decision           TEXT,          -- 'Approved', 'Declined', 'Referred', 'Pending'

  -- Identity
  legal_name                 TEXT,
  date_of_birth              DATE,
  nationality                TEXT,

  -- Identity documents (up to 2)
  id_type_1                  TEXT,          -- 'Passport', 'Driving Licence', 'Share Code', etc.
  id_ref_1                   TEXT,
  id_verified_1              BOOLEAN DEFAULT false,
  id_type_2                  TEXT,
  id_ref_2                   TEXT,
  id_verified_2              BOOLEAN DEFAULT false,

  -- Right to rent
  right_to_rent_status       TEXT,          -- 'Yes (time-limited)', 'Yes (indefinite)', 'No'
  right_to_rent_from         DATE,
  right_to_rent_until        DATE,
  right_to_rent_check_date   DATE,
  right_to_rent_ref          TEXT,
  right_to_rent_checker      TEXT,          -- company or person who ran the check

  -- Financial
  verified_income_annual     NUMERIC(12,2),
  verified_income_monthly    NUMERIC(12,2),
  max_affordable_rent_monthly NUMERIC(12,2),
  affordability_ratio        NUMERIC(5,2), -- e.g. 40 = 40%

  -- Credit
  credit_result              TEXT,          -- 'Clean', 'Issues Found'
  credit_notes               TEXT,
  active_judgments           INTEGER DEFAULT 0,
  satisfied_judgments        INTEGER DEFAULT 0,
  active_bais                BOOLEAN DEFAULT false,

  -- Residential history (JSON array of {address, from, to, confirmed})
  current_address            TEXT,
  previous_addresses         JSONB DEFAULT '[]'::jsonb,

  -- Landlord / agent reference
  prev_landlord_ref_result   TEXT,          -- 'Pass', 'Fail', 'N/A'
  prev_landlord_ref_name     TEXT,
  prev_landlord_ref_notes    TEXT,

  -- AML
  aml_result                 TEXT,          -- 'Clear', 'Issues'
  aml_notes                  TEXT,

  -- Raw AI extraction for audit trail
  raw_extracted              JSONB,

  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_refs_person  ON tenant_references(person_id);
CREATE INDEX IF NOT EXISTS idx_tenant_refs_tenancy ON tenant_references(tenancy_id);

-- Add reference-derived fields to people for quick display
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS date_of_birth          DATE,
  ADD COLUMN IF NOT EXISTS nationality            TEXT,
  ADD COLUMN IF NOT EXISTS right_to_rent_until    DATE,
  ADD COLUMN IF NOT EXISTS right_to_rent_ref      TEXT,
  ADD COLUMN IF NOT EXISTS verified_income_annual NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS credit_check_result    TEXT,
  ADD COLUMN IF NOT EXISTS reference_status       TEXT;   -- 'Approved','Declined','Referred','Pending'

-- RLS: admin only
ALTER TABLE tenant_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_refs_admin" ON tenant_references;
CREATE POLICY "tenant_refs_admin"
  ON tenant_references FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.email = auth.jwt()->>'email'
        AND p.role IN ('administrator','admin','lettings')
    )
  );
