-- 287 — Publish, closer to Mailchimp (13 Nov 2026): the inbox preview text, opens and clicks per person, the content
-- blocks and template, and A/B subject lines.
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS preheader text;                          -- the grey line after the subject in the inbox
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS template text;                           -- the designed layout it started from
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb; -- extra content blocks (button, picture, two columns, quote, divider)
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS ab jsonb NOT NULL DEFAULT '{}'::jsonb;    -- { subjectB, testShare, decideAfterHours, winner, decidedAt }

ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS provider_id text;    -- the email service's id, to match opens and clicks
ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS variant text;        -- A or B (subject line test)
ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS opens integer NOT NULL DEFAULT 0;
ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0;
ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '{}'::jsonb;   -- { url: clicks }
ALTER TABLE public.publication_sends ADD COLUMN IF NOT EXISTS bounced text;
CREATE INDEX IF NOT EXISTS publication_sends_provider_idx ON public.publication_sends (provider_id) WHERE provider_id IS NOT NULL;
