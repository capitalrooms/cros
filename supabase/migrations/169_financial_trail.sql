-- Migration 169: Financial audit trail
--
-- Closes the linkage gaps so every financial figure can be traced
-- back to its source document.
--
-- Audit chain:
--
--   RENT:     bank_transactions → rent_charges → landlord_statement_rooms → landlord_statements
--   EXPENSE:  recharge_expenses → statement_line_items → landlord_statements
--   MGMT FEE: landlord_statement_rooms → landlord_statements
--
-- The only missing link was expense ↔ statement_line_item. Adding that here.
-- Also adds a source_document column to recharge_expenses so we always know
-- whether an expense was entered manually or came from an imported statement.

ALTER TABLE public.statement_line_items
  ADD COLUMN IF NOT EXISTS recharge_expense_id UUID REFERENCES public.recharge_expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sli_expense
  ON public.statement_line_items(recharge_expense_id) WHERE recharge_expense_id IS NOT NULL;

-- Source tracking on recharge_expenses
ALTER TABLE public.recharge_expenses
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'statement_import', 'bank_import')),
  ADD COLUMN IF NOT EXISTS statement_line_item_id UUID REFERENCES public.statement_line_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exp_sli
  ON public.recharge_expenses(statement_line_item_id) WHERE statement_line_item_id IS NOT NULL;

-- Allow landlord_statement_rooms to surface its management fee provenance
-- (already has statement_id via statement_id FK — no new column needed)

-- Allow rent_charges to know which statement period it was reported on
-- (already traceable via landlord_statement_rooms.rent_charge_id)

NOTIFY pgrst, 'reload schema';
