-- Migration 256 (1 Nov 2026): a tenant message set to go again on a chosen date (Harry: "set a reminder to pay £10
-- less 25th October … whatever day we choose … rather than us having to remember"). Sent by the morning job
-- (/api/cron/nudge) on send_on; re-filled from the tenancy that day, so amounts are current. Cancel = cancelled_at.
CREATE TABLE IF NOT EXISTS public.scheduled_tenant_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id    UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  send_on       DATE NOT NULL,
  channels      TEXT[] NOT NULL,
  subject       TEXT NOT NULL,
  email         TEXT NOT NULL,
  sms           TEXT NOT NULL,
  name          TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ,
  result        JSONB,
  cancelled_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS scheduled_tenant_messages_due ON public.scheduled_tenant_messages (send_on) WHERE sent_at IS NULL AND cancelled_at IS NULL;
ALTER TABLE public.scheduled_tenant_messages ENABLE ROW LEVEL SECURITY;   -- office API only (service role)
