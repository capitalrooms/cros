-- 300 · Rate limit counters (21 Nov 2026). Used by lib/rateLimit.ts for public lookups such as the login-page
-- phone lookup. Only the server touches this table, through the service role, so no browser policy is added.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key           TEXT PRIMARY KEY,
  hits          INTEGER NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
