-- Migration 106: Company landlords, joint/co-tenants, CC emails
-- Supports: corporate landlords (ShivAgni Ltd etc), couples in rooms, joint landlords / accountant CC

-- 1. Company name on people — for corporate landlords and incorporated entities.
--    When set, shown as the primary display name (no personal first/last required).
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS company TEXT;
COMMENT ON COLUMN people.company IS
  'Company or organisation name. When set, used as the primary display name for this record.';

-- 2. Co-tenant on tenancies — for couples or joint tenants sharing a room / flat.
--    person_id = primary / lead tenant (contract holder).
--    co_tenant_id = second occupant (same tenancy, same start/end/rent).
ALTER TABLE tenancies
  ADD COLUMN IF NOT EXISTS co_tenant_id UUID REFERENCES people(id) ON DELETE SET NULL;
COMMENT ON COLUMN tenancies.co_tenant_id IS
  'Second occupant for joint or couple tenancies. Shares the tenancy with person_id.';

-- Index to efficiently look up tenancies for a co-tenant
CREATE INDEX IF NOT EXISTS idx_tenancies_co_tenant_id ON tenancies(co_tenant_id)
  WHERE co_tenant_id IS NOT NULL;

-- 3. CC emails on properties — comma-separated addresses to CC on all landlord comms.
--    Used for joint landlords, accountants, or any additional contacts.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS cc_emails TEXT;
COMMENT ON COLUMN properties.cc_emails IS
  'Comma-separated email addresses CC''d on all landlord communications (joint owners, accountants, etc).';
