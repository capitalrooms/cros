-- 267 — the latest real copy of each kind of email (6 Nov 2026), so the Email hub (/admin/email-hub) can show how
-- every email actually looks in any theme. One row per kind, replaced as new ones go out (at most every few hours).
-- Private links and codes are taken out before it's saved (lib/email/samples). Only the server reads it: RLS on,
-- no policies — nothing reaches it from a browser.
CREATE TABLE IF NOT EXISTS public.email_samples (
  kind        text PRIMARY KEY,
  body        text NOT NULL,
  hero        text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_samples ENABLE ROW LEVEL SECURITY;
