-- Migration 104: SMS confirmation tracking
-- Tracks outgoing Y/N confirmation SMS so inbound replies can be matched back.

CREATE TABLE IF NOT EXISTS sms_confirmations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           VARCHAR(20) NOT NULL,          -- E.164 format, e.g. +447700162018
  type            VARCHAR(50) NOT NULL,           -- 'viewing' | 'contractor_job'
  related_id      UUID NOT NULL,                  -- viewings.id or maintenance_tickets.id
  context_text    TEXT,                           -- human-readable summary for admin notifications
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  response        VARCHAR(10),                    -- 'Y', 'N', or null (pending)
  response_raw    TEXT,                           -- full reply text as received
  responded_at    TIMESTAMPTZ,
  agent_notified  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup by phone (most recent pending first)
CREATE INDEX idx_sms_conf_phone ON sms_confirmations(phone, sent_at DESC);
-- Fast lookup by related record
CREATE INDEX idx_sms_conf_related ON sms_confirmations(related_id);
-- Find pending (unanswered) confirmations
CREATE INDEX idx_sms_conf_pending ON sms_confirmations(phone) WHERE response IS NULL;

-- RLS: only service role / admin can read/write
ALTER TABLE sms_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_sms_confirmations"
  ON sms_confirmations FOR ALL
  USING (true)
  WITH CHECK (true);
