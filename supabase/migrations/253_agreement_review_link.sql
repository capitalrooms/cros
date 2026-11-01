-- Migration 253: send a saved management agreement to the landlord to review (1 Nov 2026). Like the tenant move-in
-- pack: they open a link, read the PDF and press "I've read it and I'm ready to sign"; the office then sends it for
-- signature. Sending a later version clears the earlier "ready".
ALTER TABLE public.management_agreements
  ADD COLUMN IF NOT EXISTS review_token    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS review_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_sent_to  TEXT,
  ADD COLUMN IF NOT EXISTS review_sent_by  TEXT,
  ADD COLUMN IF NOT EXISTS review_version  INTEGER,
  ADD COLUMN IF NOT EXISTS ready_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_name      TEXT,
  ADD COLUMN IF NOT EXISTS ready_ip        TEXT,
  ADD COLUMN IF NOT EXISTS ready_questions TEXT;
