-- Migration tracking table
--
-- Records every migration file that has been applied to this database.
-- The runner (scripts/migrate.mjs) consults this table to decide what's pending.
--
-- Never touch this table by hand — the runner writes it. If you must record a
-- migration that you applied manually via Studio, use:
--   node scripts/migrate.mjs --record <filename>

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    TEXT PRIMARY KEY,
  checksum    TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by  TEXT
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- Only the service_role writes/reads this table; no other role needs access.
DROP POLICY IF EXISTS schema_migrations_service_only ON public.schema_migrations;
CREATE POLICY schema_migrations_service_only ON public.schema_migrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.schema_migrations IS
  'Tracks which supabase/migrations/*.sql files have been applied. Written by scripts/migrate.mjs.';
