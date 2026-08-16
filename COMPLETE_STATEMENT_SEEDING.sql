-- COMPLETE STATEMENT SEEDING WITH DETAILS
-- Seeds statements + rooms + charges for full detail page display

-- Step 1: Insert all 15 statements
WITH landlord AS (
  SELECT id FROM people WHERE role = 'landlord' LIMIT 1
),
property AS (
  SELECT id FROM properties WHERE address LIKE '%71 Alloa Road%' LIMIT 1
)
INSERT INTO landlord_statements (
  id, landlord_id, property_id, statement_reference, statement_date,
  period_start, period_end, gross_rent, management_fees, property_charges,
  net_to_landlord, amount_paid, paid_date, created_at, updated_at
) VALUES
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0793', '2025-07-07', '2025-07-01', '2025-07-31', 6780.00, 813.60, 567.28, 5399.12, 5399.12, '2025-07-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0801', '2025-08-07', '2025-08-01', '2025-08-31', 6400.00, 768.00, 618.48, 5013.52, 5013.52, '2025-08-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0817', '2025-09-07', '2025-09-01', '2025-09-30', 7000.00, 840.00, 625.26, 5534.74, 5534.74, '2025-09-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0833', '2025-10-07', '2025-10-01', '2025-10-31', 5800.00, 696.00, 540.02, 4563.98, 4563.98, '2025-10-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0852', '2025-11-07', '2025-11-01', '2025-11-30', 5200.00, 624.00, 977.18, 3599.82, 3599.82, '2025-11-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0893', '2025-11-14', '2025-11-14', '2025-12-31', 2000.00, 240.00, 761.86, 998.14, 998.14, '2025-11-14', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0901', '2025-12-07', '2025-12-01', '2025-12-31', 5700.00, 684.00, 469.16, 4546.84, 4546.84, '2025-12-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0919', '2026-01-07', '2026-01-01', '2026-01-31', 7100.00, 852.00, 604.98, 5643.02, 5643.02, '2026-01-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0932', '2026-02-07', '2026-02-01', '2026-02-28', 7700.00, 924.00, 894.64, 4881.36, 4881.36, '2026-02-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0948', '2026-03-07', '2026-03-01', '2026-03-31', 6300.00, 756.00, 585.74, 4958.26, 4958.26, '2026-03-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0959', '2026-04-07', '2026-04-01', '2026-04-30', 6200.00, 744.00, 532.96, 4924.04, 4924.04, '2026-04-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0975', '2026-05-07', '2026-05-01', '2026-05-31', 5600.00, 672.00, 407.98, 3520.02, 3520.02, '2026-05-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0978', '2026-05-14', '2026-05-14', '2026-06-30', 2400.00, 288.00, 179.23, 1932.77, 1932.77, '2026-05-14', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS0987', '2026-06-07', '2026-06-01', '2026-06-30', 5650.00, 678.00, 445.02, 3526.98, 3526.98, '2026-06-07', NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LS1001', '2026-07-07', '2026-07-01', '2026-07-31', 7200.00, 864.00, 645.77, 5690.23, 5690.23, '2026-07-07', NOW(), NOW())
ON CONFLICT (landlord_id, property_id, statement_reference) DO NOTHING;

-- Step 2: Get a sample room from the property for tenant breakdown
WITH stmt AS (
  SELECT id FROM landlord_statements WHERE statement_reference = 'LS1001'
),
room_sample AS (
  SELECT DISTINCT id FROM rooms LIMIT 1
)
INSERT INTO landlord_statement_rooms (
  statement_id, room_id, tenant_id, tenant_name, rent_income, management_fee, net_to_landlord
) VALUES
  ((SELECT id FROM stmt), (SELECT id FROM room_sample), (SELECT id FROM people LIMIT 1), 'Tenant A', 1200.00, 144.00, 1056.00),
  ((SELECT id FROM stmt), (SELECT id FROM room_sample), (SELECT id FROM people LIMIT 1), 'Tenant B', 950.00, 114.00, 836.00),
  ((SELECT id FROM stmt), (SELECT id FROM room_sample), (SELECT id FROM people LIMIT 1), 'Tenant C', 1050.00, 126.00, 924.00),
  ((SELECT id FROM stmt), (SELECT id FROM room_sample), (SELECT id FROM people LIMIT 1), 'Tenant D', 1100.00, 132.00, 968.00),
  ((SELECT id FROM stmt), (SELECT id FROM room_sample), (SELECT id FROM people LIMIT 1), 'Tenant E', 875.00, 105.00, 770.00),
  ((SELECT id FROM stmt), (SELECT id FROM room_sample), (SELECT id FROM people LIMIT 1), 'Tenant F', 825.00, 99.00, 726.00),
  ((SELECT id FROM stmt), (SELECT id FROM room_sample), (SELECT id FROM people LIMIT 1), 'Tenant G', 1200.00, 144.00, 1056.00)
ON CONFLICT DO NOTHING;

-- Step 3: Add property charges for LS1001
WITH stmt AS (
  SELECT id FROM landlord_statements WHERE statement_reference = 'LS1001'
)
INSERT INTO landlord_statement_charges (
  statement_id, description, category, amount
) VALUES
  ((SELECT id FROM stmt), 'Netflix', 'subscriptions', 18.99),
  ((SELECT id FROM stmt), 'AO washing machine cover', 'subscriptions', 5.99),
  ((SELECT id FROM stmt), 'Community Fibre Broadband 1Gbps', 'utilities', 28.30),
  ((SELECT id FROM stmt), 'Boiler maintenance', 'maintenance', 50.00),
  ((SELECT id FROM stmt), 'Plumbing inspection', 'maintenance', 370.00),
  ((SELECT id FROM stmt), 'Monthly house cleaning', 'cleaning', 144.00),
  ((SELECT id FROM stmt), 'Council tax', 'utilities', 28.49)
ON CONFLICT DO NOTHING;

-- Step 4: Verify all data
SELECT 'Statements' as data_type, COUNT(*) as count FROM landlord_statements
UNION ALL
SELECT 'Statement Rooms', COUNT(*) FROM landlord_statement_rooms
UNION ALL
SELECT 'Statement Charges', COUNT(*) FROM landlord_statement_charges;
