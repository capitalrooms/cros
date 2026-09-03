-- Migration 108: Early move-out requests + deposit release tracking

-- 1. Early move-out requests — tenant-initiated, admin-approved early exit route.
CREATE TABLE IF NOT EXISTS early_move_out_requests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id                UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  person_id                 UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  property_id               UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id                   UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

  -- Tenant's request
  requested_move_out_date   DATE NOT NULL,
  reason                    TEXT,
  status                    TEXT NOT NULL DEFAULT 'pending',
  -- status values: pending | approved | rejected | completed | withdrawn

  -- Admin Approval Point 1 — enables the self-marketing route
  ap1_approved_at           TIMESTAMPTZ,
  ap1_approved_by           UUID REFERENCES people(id) ON DELETE SET NULL,
  terms_sent_at             TIMESTAMPTZ,   -- when auto-terms message was sent to tenant

  -- Replacement tenant details (found via either route)
  replacement_person_id     UUID REFERENCES people(id) ON DELETE SET NULL,
  replacement_start_date    DATE,
  found_by                  TEXT,          -- 'tenant' | 'capital_rooms'

  -- Admin Approval Point 2 — approves handover + refund
  ap2_approved_at           TIMESTAMPTZ,
  ap2_approved_by           UUID REFERENCES people(id) ON DELETE SET NULL,
  refund_days               INTEGER,       -- overpaid days
  refund_amount             NUMERIC(10,2), -- calculated, not auto-transferred
  refund_daily_rate         NUMERIC(10,2), -- daily rate used in calculation
  refund_processed_at       TIMESTAMPTZ,   -- admin marks when actually paid out

  -- Amazon voucher (discretionary admin decision only — never auto-calculated)
  voucher_awarded           BOOLEAN,
  voucher_amount            NUMERIC(10,2),
  voucher_note              TEXT,

  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_early_move_out_tenancy ON early_move_out_requests(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_early_move_out_status ON early_move_out_requests(status) WHERE status IN ('pending', 'approved');

-- 2. Deposit release tracking on tenancies.
--    Fast 4-business-day release when checkout inspection is clean.
ALTER TABLE tenancies
  ADD COLUMN IF NOT EXISTS deposit_amount         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS deposit_held_by        TEXT,  -- 'dps' | 'agent' | 'landlord'
  ADD COLUMN IF NOT EXISTS deposit_scheme_ref     TEXT,
  ADD COLUMN IF NOT EXISTS deposit_release_status TEXT DEFAULT 'pending',
  -- deposit_release_status values:
  --   pending       — not yet inspected / tenancy still active
  --   clean         — inspection passed, eligible for fast 4-business-day release
  --   deductions    — deductions needed, follows standard DPS process
  --   released      — deposit confirmed returned to tenant
  ADD COLUMN IF NOT EXISTS deposit_inspection_at  TIMESTAMPTZ,  -- when check-out inspection was done
  ADD COLUMN IF NOT EXISTS deposit_inspection_by  UUID REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deposit_inspection_notes TEXT,
  ADD COLUMN IF NOT EXISTS deposit_released_at    TIMESTAMPTZ;  -- when admin confirms deposit returned

COMMENT ON COLUMN tenancies.deposit_release_status IS
  'clean = eligible for fast 4-business-day release; deductions = standard DPS process applies';
