-- Migration 177: Link recharge_expenses to the statement they were included in.
-- Prevents double-counting: once an expense is on a statement, it won't appear
-- on the next auto-generated one.

ALTER TABLE recharge_expenses
  ADD COLUMN IF NOT EXISTS included_in_statement_id UUID REFERENCES landlord_statements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recharge_expenses_statement
  ON recharge_expenses (included_in_statement_id)
  WHERE included_in_statement_id IS NOT NULL;

COMMENT ON COLUMN recharge_expenses.included_in_statement_id IS
  'Set when this expense is pulled into a landlord statement. Null = not yet included.';
