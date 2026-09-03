-- Migration 114: Portfolio income snapshots for the Growth trend view.
-- A monthly cron job inserts one row per run. Historical rows build the trend chart.

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE, -- one row per month (cron uses first of month)
  total_rent    NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- sum of all occupied rooms' current_asking_rent
  total_fee     NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- sum of (rent × management_fee_pct / 100)
  room_count    INTEGER NOT NULL DEFAULT 0,          -- number of rooms with a rent value
  property_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: only service role can write; admins can read
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read snapshots"
  ON portfolio_snapshots FOR SELECT
  USING (true); -- read is open; inserts only via service role from cron
