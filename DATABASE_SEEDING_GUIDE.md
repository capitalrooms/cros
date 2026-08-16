# Database Seeding Guide - LANDLORD STATEMENTS

## Quick Start: Seed All 15 Statements (2 minutes)

### Option 1: Using Supabase Dashboard (EASIEST)

1. Go to: https://app.supabase.com/project/fihjzzxxhprxgjuefgtb
2. Click "SQL Editor" (left sidebar)
3. Create a new query
4. Copy & paste the SQL below
5. Click "Run"
6. Refresh your browser at http://localhost:3000/landlord

### SQL to Execute

```sql
-- Seed 15 landlord statements (LS0793-LS1001)
-- This populates the dashboard with complete financial data

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

-- Verify seeding
SELECT COUNT(*) as total_statements, 
       MIN(statement_date)::date as earliest,
       MAX(statement_date)::date as latest,
       SUM(net_to_landlord)::numeric(12,2) as total_net
FROM landlord_statements;
```

---

## TEMPLATE FOR OTHER PROPERTIES

To add statements for a new property, use this template:

```sql
WITH landlord AS (
  SELECT id FROM people WHERE role = 'landlord' LIMIT 1
),
property AS (
  SELECT id FROM properties WHERE id = 'your-property-id-here'
)
INSERT INTO landlord_statements (
  id, landlord_id, property_id, statement_reference, statement_date,
  period_start, period_end, gross_rent, management_fees, property_charges,
  net_to_landlord, amount_paid, paid_date, created_at, updated_at
) VALUES
  (gen_random_uuid(), (SELECT id FROM landlord), (SELECT id FROM property), 'LSXXXX', '2026-07-07', '2026-07-01', '2026-07-31', 0.00, 0.00, 0.00, 0.00, 0.00, '2026-07-07', NOW(), NOW())
ON CONFLICT DO NOTHING;
```

**Change these values:**
- `LSXXXX` → Your statement reference (e.g., LS2001)
- `your-property-id-here` → Property UUID
- All monetary values to your actual figures
- Dates to match the statement period

---

## WHAT GETS SEEDED

| Field | Value | Notes |
|-------|-------|-------|
| Statements | 15 | LS0793 through LS1001 |
| Date Range | Jul 2025 - Jul 2026 | Full year of data |
| Gross Rent Range | £2,000 - £7,700 | Realistic monthly variation |
| All Payments | Marked as completed | paid_date populated |
| Property | 71 Alloa Road | Single property demo |
| Landlord | First landlord in system | Uses existing landlord |

---

## VERIFICATION

After seeding, you should see in the dashboard:

✅ 15 statements in the list (most recent first)
✅ Each statement shows Gross Rent, Fees, Charges, Net
✅ Date picker shows full range from Jul 2025 to Jul 2026
✅ Multi-month filtering works when selecting date ranges
✅ Financial summary aggregates correctly for selected period

---

## TEMPLATE USAGE FOR YOUR WORKFLOW

**When you import statements from PDF:**

1. Parse PDF using the Python parser (statement_parser.py)
2. Get the extracted data (statement_reference, dates, amounts, etc.)
3. Identify the landlord ID and property ID
4. Insert using the template above
5. Dashboard automatically displays and aggregates

**No code changes needed** - just insert the data and it works!

---

## TROUBLESHOOTING

**Q: Statements don't appear after seeding?**
- Make sure you're logged in as the correct landlord
- Check the landlord_id in the insert matches your user
- Verify the property exists and matches the address filter

**Q: Can't find property ID?**
- Go to Supabase SQL Editor
- Run: `SELECT id, name, address FROM properties;`
- Copy the UUID for your property

**Q: Formula calculations wrong?**
- Net = Gross Rent - Management Fees - Property Charges
- Check all three values are populated correctly

---

## NEXT STEPS

1. ✅ Seed the 15 statements using SQL above
2. 🔄 Refresh browser at http://localhost:3000/landlord
3. 📊 Test multi-month filtering with date picker
4. 📋 Click each statement to see detailed breakdown
5. 🎯 Repeat template for other properties
