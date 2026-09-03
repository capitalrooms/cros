-- Migration 110: Enable RLS on tables that were created without it
-- (fixes Supabase security advisor warnings: rls_disabled_in_public + sensitive_columns_exposed)
--
-- CROS uses createServiceClient() (service role) in all API routes.
-- Service role BYPASSES RLS entirely, so these policies only gate
-- direct client-SDK access — they never block legitimate server-side queries.
--
-- Pattern guide:
--   Service-key-only tables → USING (false)  → blocks anonymous + auth client, service key still works
--   Mixed-access tables     → permissive authenticated policy (auth check is the real guard)

-- ── system_settings ──────────────────────────────────────────────────────────
-- Only ever read/written by API routes via createServiceClient(). No client
-- dashboard component queries it directly.
ALTER TABLE IF EXISTS system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_client_access" ON system_settings;
CREATE POLICY "no_direct_client_access" ON system_settings
  FOR ALL USING (false);

-- ── early_move_out_requests ───────────────────────────────────────────────────
-- Tenant submits via /api/tenant/early-move-out (service key).
-- Admin manages via /api/tenant/early-move-out (service key + admin check).
-- Neither path uses the client SDK directly, so lock it down the same way.
ALTER TABLE IF EXISTS early_move_out_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_client_access" ON early_move_out_requests;
CREATE POLICY "no_direct_client_access" ON early_move_out_requests
  FOR ALL USING (false);

-- ── admin_view_as_log ────────────────────────────────────────────────────────
-- Written only via /api/admin/view-as-log (service key). Never client-side.
ALTER TABLE IF EXISTS admin_view_as_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_client_access" ON admin_view_as_log;
CREATE POLICY "no_direct_client_access" ON admin_view_as_log
  FOR ALL USING (false);

-- ── Catch-all: enable RLS on any other table that's still missing it ──────────
-- Run the query below to find any remaining tables, then add them above.
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
