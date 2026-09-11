-- 147: Contractor quote requests
-- Adds quote fields to maintenance_tickets so admin can request a quote
-- before booking a job in. Contractor can submit a price or request a site visit first.

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS quote_requested     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quote_amount        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS quote_notes         TEXT,
  ADD COLUMN IF NOT EXISTS quote_site_visit    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quote_visit_date    DATE,
  ADD COLUMN IF NOT EXISTS quote_submitted_at  TIMESTAMPTZ;

-- Index so contractor dashboard can quickly find quote requests assigned to them
CREATE INDEX IF NOT EXISTS idx_maint_quote_requested
  ON maintenance_tickets(contractor_id, quote_requested)
  WHERE quote_requested = TRUE;
