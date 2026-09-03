-- Migration 115: Rent charges ledger
-- One row per room per month. Admin marks rent as received/overdue/partial.
-- Drives the Rent Roll tab in /admin/accounts and the Arrears tracker.

CREATE TABLE IF NOT EXISTS rent_charges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  property_id     UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- Always the 1st of the month, e.g. 2026-09-01
  charge_month    DATE        NOT NULL,
  amount_due      NUMERIC(10, 2) NOT NULL,
  amount_received NUMERIC(10, 2) NOT NULL DEFAULT 0,
  received_date   DATE,
  -- pending = generated, not yet confirmed; partial = some received; paid = full
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'waived')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, charge_month)
);

CREATE INDEX IF NOT EXISTS idx_rent_charges_month    ON rent_charges(charge_month);
CREATE INDEX IF NOT EXISTS idx_rent_charges_property ON rent_charges(property_id, charge_month);
CREATE INDEX IF NOT EXISTS idx_rent_charges_status   ON rent_charges(status, charge_month);

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION _bump_rent_charges_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_rent_charges_updated ON rent_charges;
CREATE TRIGGER trg_rent_charges_updated
  BEFORE UPDATE ON rent_charges
  FOR EACH ROW EXECUTE FUNCTION _bump_rent_charges_updated_at();

ALTER TABLE rent_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_rent_charges" ON rent_charges FOR ALL USING (
  EXISTS (
    SELECT 1 FROM people
    WHERE email = (auth.jwt() ->> 'email')
      AND role IN ('administrator', 'admin', 'lettings')
  )
);
