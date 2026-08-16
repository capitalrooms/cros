# Landlord Statements Feature

**Status:** ✅ READY TO TEST  
**Purpose:** Display monthly financial statements from accounting system  
**Users:** Landlords with one or more properties

---

## 📋 WHAT THIS IS

CROS displays clean, organized statements that the accounting system generates monthly.

**NOT** a financial system — we don't calculate rent, fees, or charges.  
**JUST** a beautiful presentation layer for existing statement data.

---

## 🎯 FEATURES

### ✅ Main Dashboard (`/landlord`)
- **Property selector** (if landlord owns multiple properties)
- **Statement history** (list of all monthly statements)
- **Current month summary** (quick overview card)
- **Quick stats** (gross rent, fees, charges, net to landlord)

### ✅ Detailed Statement View (`/landlord/statement/[id]`)
- **Per-room breakdown** (who paid, how much rent, fees applied)
- **Property charges** (subscriptions, maintenance, utilities, cleaning)
- **Payment status** (was it paid, when, how much)
- **Organized by category** (utilities, subscriptions, maintenance, etc.)

### ✅ Multi-Property Support
- Dropdown selector to switch properties
- Each landlord sees only their own properties
- Statement archive independent per property

### ✅ Data Security
- RLS policies: Landlords only see their own statements
- Admin/system role required to import statements
- Tenants cannot see landlord financial data

---

## 🗂️ DATABASE SCHEMA

### `landlord_statements`
Main statement record (one per month per property)

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| landlord_id | UUID | Links to landlord |
| property_id | UUID | Which property |
| statement_reference | VARCHAR | LS1001, LS1002, etc. |
| statement_date | DATE | When statement was issued |
| period_start | DATE | Period beginning |
| period_end | DATE | Period end |
| gross_rent | NUMERIC | Total tenant rents |
| management_fees | NUMERIC | Total 12% fees |
| property_charges | NUMERIC | Total expenses |
| net_to_landlord | NUMERIC | Amount to pay landlord |
| amount_paid | NUMERIC | Actual payment amount |
| paid_date | DATE | When payment occurred |

### `landlord_statement_rooms`
Per-room rent breakdown (one row per room per statement)

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| statement_id | UUID | Links to statement |
| room_id | UUID | Which room |
| tenant_id | UUID | Who's living there |
| tenant_name | VARCHAR | Tenant name (denormalized) |
| rent_income | NUMERIC | Rent they paid |
| management_fee | NUMERIC | 12% of their rent |
| net_to_landlord | NUMERIC | Rent minus fee |

### `landlord_statement_charges`
Property-level deductions (utilities, cleaning, subscriptions, etc.)

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Primary key |
| statement_id | UUID | Links to statement |
| description | VARCHAR | Netflix, Cleaning, Broadband, etc. |
| category | VARCHAR | subscriptions, maintenance, utilities, cleaning, other |
| amount | NUMERIC | Cost |

---

## 🔧 IMPLEMENTATION DETAILS

### File Structure
```
app/landlord/
├── page.tsx                          # Main dashboard + statement list
└── statement/
    └── [statementId]/
        └── page.tsx                  # Detailed statement view

supabase/migrations/
└── 041-landlord-statements.sql      # Schema + RLS policies

app/api/seed/
└── landlord-statements/route.ts     # Test data loader
```

### How Landlords Access It

**URL:** `https://capital-rooms.vercel.app/landlord`

**Login:**
- Email: landlord@capitalrooms.co.uk (or your test landlord email)
- Password: [their password]

**First time?**
1. Property selector loads their properties
2. If no statements yet, shows "No statements yet"
3. Seed test data via API (see testing section)
4. Select statement → view summary
5. Click "View Detailed Breakdown" → see full breakdown

---

## 🧪 TESTING

### Setup Test Data

**Step 1: Create landlord user** (if not already done)
```
Supabase Console → Auth → Add new user
Email: landlord@capitalrooms.co.uk
Password: password123 (or your test password)

Then in people table:
- auth_id: [the user's UID]
- role: landlord
- full_name: Richard Page
```

**Step 2: Assign properties to landlord**
```
Supabase Console → properties table
Update properties:
- landlord_id: [landlord's UUID]
```

**Step 3: Create test tenancies**
Assign test tenants to rooms in the properties.

**Step 4: Load sample statement data**
```bash
curl -X POST http://localhost:3000/api/seed/landlord-statements
```

Expected response:
```json
{
  "success": true,
  "message": "Sample statement created successfully",
  "statement": {
    "reference": "LS1001",
    "property": "71 Alloa Road",
    "date": "2026-07-03",
    "gross_rent": 7720.00,
    "management_fees": 1103.37,
    "property_charges": 176.97,
    "net_to_landlord": 6616.63
  },
  "rooms_created": 7,
  "charges_created": 5
}
```

### Test Scenarios

**Scenario 1: View statement summary**
1. Log in as landlord@capitalrooms.co.uk
2. Property selector shows your property ✓
3. Statements list shows LS1001 ✓
4. Click LS1001 → shows summary card with totals ✓
5. Net to you shows £6,616.63 ✓

**Scenario 2: View detailed breakdown**
1. From summary, click "View Detailed Breakdown"
2. Page shows property name and address ✓
3. Room breakdown table shows 7 rooms ✓
4. Each room shows: tenant name, rent, fee, net ✓
5. Property charges section shows 5 line items ✓
6. Charges grouped by category (subscriptions, utilities, etc.) ✓

**Scenario 3: Multi-property landlord**
1. Assign 2 properties to same landlord
2. Load statement data for both
3. Log in as landlord
4. Property selector shows both properties ✓
5. Switch between properties → statements change ✓
6. Each property has independent statement history ✓

**Scenario 4: Data isolation**
1. Log in as tenant@example.com (or other role)
2. Try accessing /landlord → redirects to /login ✓
3. Try accessing /landlord/statement/[id] → redirects ✓
4. Landlord statements not visible to non-landlords ✓

**Scenario 5: Payment tracking**
1. View statement detail page
2. Payment status section shows "✓ Payment Completed"
3. Shows payment date (03 July 2026)
4. Shows payment amount (£6,616.63)

---

## 📧 FUTURE: EMAIL IMPORT

When you're ready to automate monthly imports from accounting system:

**Setup:**
1. Configure email forwarding to docs@capitalrooms.co.uk
2. Accounting system CCs statements to that address
3. Create email parser (read PDF, extract data)
4. Auto-insert into landlord_statements tables

**Flow:**
```
Accounting system generates statement
            ↓
CCs to docs@capitalrooms.co.uk
            ↓
Email parser extracts data
            ↓
Insert into landlord_statements (with dedup check)
            ↓
Landlord logs in → sees latest statement
```

This would be a separate feature (not yet implemented).

---

## 🔐 SECURITY

### Row-Level Security (RLS)

**Who can see statements?**
- Landlords: Only their own statements ✓
- Admin/System: Can insert new statements (for imports)
- Everyone else: No access

**Query example:**
```sql
-- This runs automatically via RLS
SELECT * FROM landlord_statements
WHERE landlord_id = (SELECT id FROM people WHERE auth_id = auth.uid());
```

### Field Visibility
- Tenant names: ✓ Shown (already public on property notes)
- Rent amounts: ✓ Shown to landlord only
- Charges: ✓ Shown to landlord only
- Personal data: ✗ Not visible to others

---

## 📊 DATA STRUCTURE FROM PDF

The sample data matches the real LS1001 statement format:

```
STATEMENT: 03 July 2026
PROPERTY: 71 Alloa Road
PERIOD: 01/07/2026 - 31/07/2026

Room 1 - Karina Bermudez     £950.00 rent → £114.00 fee → £836.00 net
Room 2 - Elizabeth Vogel     £850.00 rent → £102.00 fee → £748.00 net
Room 3 - Don Pubudu        £1,075.00 rent → £129.00 fee → £946.00 net
Room 4 - Sebastian Elliott   £850.00 rent → £102.00 fee → £748.00 net
Room 5 - Aslan Almukh...     £995.00 rent → £119.40 fee → £875.60 net
Room 6 - Alyssa Miles        £1,200.00 rent → £144.00 fee → £1,056.00 net
Room 7 - Ava Eldridge        £950.00 rent → £114.00 fee → £836.00 net

TOTAL RENT:               £7,720.00
TOTAL FEES (12%):        -£1,103.37
PROPERTY CHARGES:          -£176.97
   - Netflix                £18.99
   - Washing machine cover   £5.99
   - Broadband             £32.00
   - Cleaning              £90.00
   - Weedkiller            £29.99

NET TO LANDLORD:         £6,616.63
PAID ON:                 03/07/2026
```

---

## 🚀 DEPLOYMENT CHECKLIST

Before going live:

- [ ] Migration 041 applied to Supabase production
- [ ] Landlord user created with correct role
- [ ] Properties assigned to landlord (landlord_id filled)
- [ ] Sample data loaded via API (or manual entry)
- [ ] Landlord can log in successfully
- [ ] Dashboard shows property selector ✓
- [ ] Statement list shows imported statements ✓
- [ ] Detailed view loads correctly ✓
- [ ] No data leakage (RLS working) ✓
- [ ] Navigation links back to main menu ✓

---

## 📝 USAGE NOTES

### For Landlords
- **Monthly routine:** Log in → select property → view latest statement
- **Archive:** All previous months available via statement list
- **Multi-property:** Use dropdown to compare properties
- **Print:** Browser print function works (clean layout for PDF)

### For Admin
- **Import process:** After accounting generates statement PDF
  1. Extract data (manually or via parser)
  2. Call API or insert into DB
  3. Landlord immediately sees new statement
- **Deduplication:** `UNIQUE(landlord_id, property_id, statement_reference)` prevents re-imports
- **Verification:** Check landlord_statements table in Supabase

### For Developers
- **Add new statement:** INSERT into landlord_statements + rooms + charges
- **Monthly task:** Parse PDF from docs@capitalrooms.co.uk → import to DB
- **Query data:** Use RLS-enforced queries (Supabase client handles auth)
- **Testing:** Use seed API to load test data

---

## 📞 QUESTIONS?

- **Multi-property logic:** Uses dropdown selector (simpler than multi-view)
- **Tax year:** April to March (UK standard) — can filter in future UI
- **Charge allocation:** Per-property level (can be enhanced to show room-specific charges)
- **Payment tracking:** Just displays paid_date and amount_paid (no calculation)
- **Real data:** Awaiting monthly PDFs from accounting system

---

## NEXT STEPS

1. ✅ Schema created (migration 041)
2. ✅ Landlord dashboard pages built
3. ✅ Sample data seeding ready
4. → Test with sample data
5. → Assign real landlord user to properties
6. → Build PDF email parser (future)
7. → Set up monthly import automation (future)

