-- 103: statement_line_items
-- Normalises the expenses JSONB on landlord_statements into rows so we can
-- query across statements (totals by category, YoY trends, duplicate detection).
-- RLS: landlords read their own; admins manage all.

CREATE TABLE IF NOT EXISTS statement_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id      UUID NOT NULL REFERENCES landlord_statements(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  landlord_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,

  -- The raw line as it appeared on the statement
  description       TEXT NOT NULL,
  amount            NUMERIC(10,2) NOT NULL,

  -- Categorisation
  -- category slug: one of the EXPENSE_CATEGORIES keys, or 'other'
  category          TEXT NOT NULL DEFAULT 'other',
  -- 'property_wide' | 'room_specific'
  category_type     TEXT NOT NULL DEFAULT 'property_wide',
  -- FK to rooms if room_specific (nullable)
  room_id           UUID REFERENCES rooms(id) ON DELETE SET NULL,
  -- Human-readable room label when room_id can't be resolved
  room_label        TEXT,

  -- AI categorisation metadata
  ai_category       TEXT,               -- AI's best-guess slug
  ai_confidence     NUMERIC(4,3),       -- 0.000–1.000
  admin_confirmed   BOOLEAN NOT NULL DEFAULT false,

  -- Denormalised for efficient date-range queries
  statement_date    DATE NOT NULL,
  period_start      DATE,
  period_end        DATE,

  -- Source of this record
  source            TEXT NOT NULL DEFAULT 'manual',  -- manual | csv | email | backfill

  -- Duplicate detection: hash of (property_id, statement_date, description, amount)
  dedup_hash        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sli_landlord   ON statement_line_items(landlord_id);
CREATE INDEX IF NOT EXISTS idx_sli_property   ON statement_line_items(property_id);
CREATE INDEX IF NOT EXISTS idx_sli_statement  ON statement_line_items(statement_id);
CREATE INDEX IF NOT EXISTS idx_sli_category   ON statement_line_items(landlord_id, category);
CREATE INDEX IF NOT EXISTS idx_sli_date       ON statement_line_items(landlord_id, statement_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sli_dedup ON statement_line_items(dedup_hash) WHERE dedup_hash IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_sli_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_sli_updated_at ON statement_line_items;
CREATE TRIGGER trg_sli_updated_at
  BEFORE UPDATE ON statement_line_items
  FOR EACH ROW EXECUTE FUNCTION update_sli_updated_at();

-- RLS
ALTER TABLE statement_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landlords_read_own_sli" ON statement_line_items;
CREATE POLICY "landlords_read_own_sli" ON statement_line_items
  FOR SELECT USING (
    landlord_id IN (
      SELECT id FROM people
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "admins_manage_sli" ON statement_line_items;
CREATE POLICY "admins_manage_sli" ON statement_line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE email = (auth.jwt() ->> 'email')
        AND role IN ('administrator', 'admin', 'lettings')
    )
  );
