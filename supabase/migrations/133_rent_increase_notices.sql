-- Migration 133: Rent increase notices (Section 13 / Form 4A)
--
-- Tracks every Section 13 notice served, including the PDFs generated,
-- the proposed effective date, and when the rent was actually applied.
-- rent_amount on the tenancy is NOT updated until admin confirms the
-- change took effect (tenant may counter-offer or go to tribunal).

CREATE TABLE IF NOT EXISTS rent_increase_notices (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy relationship
  tenancy_id              UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  person_id               UUID NOT NULL REFERENCES people(id)    ON DELETE CASCADE,
  property_id             UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id                 UUID NOT NULL REFERENCES rooms(id)      ON DELETE CASCADE,

  -- Rent figures
  old_rent                NUMERIC(10,2) NOT NULL,
  proposed_rent           NUMERIC(10,2) NOT NULL,

  -- Dates
  notice_served_date      DATE NOT NULL,       -- date the notice was sent/served
  effective_date          DATE NOT NULL,       -- proposed new rent start date (validated)

  -- Prior s.13 anchor (for 52-week rule on repeat increases)
  -- NULL if this is the first Section 13 notice for this tenancy
  last_s13_effective_date DATE,

  -- Outcome
  -- pending: served, waiting for tenant response
  -- accepted: tenant accepted proposed rent
  -- negotiated: agreed a lower rent (see negotiated_rent)
  -- tribunal: tenant referred to tribunal
  -- withdrawn: admin withdrew the notice
  outcome                 TEXT DEFAULT 'pending'
    CHECK (outcome IN ('pending','accepted','negotiated','tribunal','withdrawn')),
  negotiated_rent         NUMERIC(10,2),       -- set if outcome = 'negotiated'
  negotiated_effective_date DATE,              -- may differ from original effective_date
  outcome_notes           TEXT,

  -- When the rent_amount on tenancies table was actually updated
  rent_applied_at         TIMESTAMPTZ,         -- NULL until admin confirms applied
  rent_applied_by         UUID REFERENCES people(id),

  -- Generated PDF storage paths (stored in inbox-docs bucket for consistency)
  cover_letter_path       TEXT,
  form4a_path             TEXT,

  -- Admin who initiated
  created_by              UUID REFERENCES people(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rin_tenancy  ON rent_increase_notices(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_rin_person   ON rent_increase_notices(person_id);
CREATE INDEX IF NOT EXISTS idx_rin_outcome  ON rent_increase_notices(outcome);
CREATE INDEX IF NOT EXISTS idx_rin_date     ON rent_increase_notices(notice_served_date DESC);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION _bump_rin_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_rin_updated ON rent_increase_notices;
CREATE TRIGGER trg_rin_updated
  BEFORE UPDATE ON rent_increase_notices
  FOR EACH ROW EXECUTE FUNCTION _bump_rin_updated_at();

ALTER TABLE rent_increase_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_rent_increase_notices" ON rent_increase_notices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE email = (auth.jwt() ->> 'email')
        AND role IN ('administrator', 'admin', 'lettings')
    )
  );
