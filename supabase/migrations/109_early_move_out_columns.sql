-- Migration 109: Add missing columns to early_move_out_requests
-- (108 had the base table; this adds track, admin messages, replacement name/email, daily_rate alias)

ALTER TABLE early_move_out_requests
  -- Two-track: 'standard' (we find replacement) | 'find_replacement' (tenant finds one)
  ADD COLUMN IF NOT EXISTS track                     TEXT NOT NULL DEFAULT 'standard',
  -- Admin messages sent back to tenant at each approval point
  ADD COLUMN IF NOT EXISTS admin_response_ap1        TEXT,
  ADD COLUMN IF NOT EXISTS admin_response_ap2        TEXT,
  -- Simple name+email for replacement found by tenant (before a full person record is created)
  ADD COLUMN IF NOT EXISTS replacement_tenant_name   TEXT,
  ADD COLUMN IF NOT EXISTS replacement_tenant_email  TEXT,
  -- Daily rate alias so queries work under either column name
  ADD COLUMN IF NOT EXISTS daily_rate                NUMERIC(10,2);

-- ap1_approved = 'ap1_approved', ap2_approved = 'ap2_approved' status values
-- (migration 108 listed 'approved' but the code uses ap1_approved / ap2_approved for clarity)
-- No constraint change needed — TEXT column accepts any value.

-- Sync daily_rate from refund_daily_rate where already set
UPDATE early_move_out_requests
  SET daily_rate = refund_daily_rate
  WHERE refund_daily_rate IS NOT NULL AND daily_rate IS NULL;
