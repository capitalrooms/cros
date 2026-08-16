-- 044: per-room rent lines + itemised expenses for landlord statements.
-- Kept deliberately minimal: the breakdown is stored as JSON on the statement row,
-- so there are NO new tables and NO new RLS policies to manage — the existing
-- landlord_statements policies (landlords read own, admins manage) already apply.
--
--   rooms:    [{ "room_number": 1, "tenant_name": "…", "rent_income": 950,
--               "management_fee": 114, "net_to_landlord": 836 }, …]
--   expenses: [{ "description": "Broadband", "amount": 28.30 }, …]
--
-- landlord_statements keeps the rolled-up totals (gross/fees/charges/net) the
-- dashboard sums; these columns just hold the breakdown for the statement view.

ALTER TABLE properties          ADD COLUMN IF NOT EXISTS management_fee_pct numeric NOT NULL DEFAULT 12;
ALTER TABLE landlord_statements ADD COLUMN IF NOT EXISTS management_fee_pct numeric;
ALTER TABLE landlord_statements ADD COLUMN IF NOT EXISTS rooms jsonb;
ALTER TABLE landlord_statements ADD COLUMN IF NOT EXISTS expenses jsonb;
