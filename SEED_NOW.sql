-- FINAL SEEDING - Copy and paste this into Supabase SQL Editor and click RUN

-- Get IDs (these are one-time lookups)
WITH
landlord_info AS (
  SELECT id, email FROM people WHERE role = 'landlord' LIMIT 1
),
property_info AS (
  SELECT id, name FROM properties WHERE address LIKE '%71 Alloa Road%' LIMIT 1
)
-- Insert just ONE statement first to test
INSERT INTO landlord_statements (
  landlord_id, property_id, statement_reference, statement_date,
  period_start, period_end, gross_rent, management_fees, property_charges,
  net_to_landlord, amount_paid, paid_date, created_at, updated_at
)
SELECT
  (SELECT id FROM landlord_info),
  (SELECT id FROM property_info),
  'LS1001', '2026-07-07', '2026-07-01', '2026-07-31',
  7200.00, 864.00, 645.77, 5690.23, 5690.23, '2026-07-07',
  NOW(), NOW()
ON CONFLICT (landlord_id, property_id, statement_reference) DO NOTHING;

-- Verify it was inserted
SELECT
  statement_reference,
  statement_date,
  gross_rent,
  net_to_landlord
FROM landlord_statements
WHERE statement_reference = 'LS1001'
LIMIT 1;
