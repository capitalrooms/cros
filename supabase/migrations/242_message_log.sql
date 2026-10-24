-- 242 — One log of every email and text CROS sends (24 Oct 2026, the room page, option D: "Messages and activity" shows
-- every email and text to anyone tied to a room). Until now emails were only kept by the email service (Resend) and
-- texts only by Twilio, so CROS couldn't show what a tenant or applicant had been sent. lib/sendEmail and lib/sms write
-- one row per message; the room page matches rows to people by their email address or mobile.
-- Office-only: RLS on with no policies, so only the server (service key) reads or writes it. Safe to run more than once.
CREATE TABLE IF NOT EXISTS public.message_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel      text NOT NULL CHECK (channel IN ('email', 'sms')),
  to_address   text NOT NULL,                 -- one row per recipient: an email address, or a mobile in +44 form
  cc           text[],
  subject      text,
  preview      text,                          -- the first few hundred characters, as plain text
  provider_id  text,                          -- the email service's id, or Twilio's message id
  status       text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error        text,
  sent_by      text,                          -- who it was sent as (the sender's address)
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_log_to_idx ON public.message_log (lower(to_address), created_at DESC);
CREATE INDEX IF NOT EXISTS message_log_created_idx ON public.message_log (created_at DESC);
ALTER TABLE public.message_log ENABLE ROW LEVEL SECURITY;
