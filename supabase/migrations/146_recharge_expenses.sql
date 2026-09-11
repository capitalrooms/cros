-- 146: Recharge expense tracker
-- Standalone table for logging expenses between statement imports.
-- Admin logs expenses as they happen → sends monthly summary to accountant.

CREATE TABLE IF NOT EXISTS recharge_expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  amount          NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      UUID REFERENCES people(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ         -- set when included in a send-to-accounts batch
);

CREATE INDEX idx_recharge_expenses_property ON recharge_expenses(property_id);
CREATE INDEX idx_recharge_expenses_date     ON recharge_expenses(expense_date DESC);
CREATE INDEX idx_recharge_expenses_unsent   ON recharge_expenses(sent_at) WHERE sent_at IS NULL;

-- RLS: admin-only read/write
ALTER TABLE recharge_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to recharge_expenses"
  ON recharge_expenses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.email = auth.jwt()->>'email'
        AND people.role IN ('administrator', 'admin')
    )
  );
