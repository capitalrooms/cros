-- 285 — Publish (13 Nov 2026, Harry: "one Publish flow … study the best ways of doing all comms from CRMs including pdf
-- letters, texts, emails, push notifications, reports in email, reports with email and pdf … eventually Instagram,
-- website, Facebook"). Write a piece once, choose who and where; every send is logged; opt-outs are honoured.

CREATE TABLE IF NOT EXISTS public.publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'market_update',          -- market_update | announcement
  title text NOT NULL,
  period text,                                          -- the rents month a market update is for, e.g. 2026-09
  areas text[] NOT NULL DEFAULT '{}',                   -- borough codes for the shared version (London-wide if empty)
  intro text,                                           -- the opening line
  body text,                                            -- the words: commentary (market) or the message (announcement)
  sms_text text, push_title text, push_body text, social_caption text,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,          -- { lists: ['all_landlords'], people: [{name,email,phone,personId}], ownAreas: true }
  channels jsonb NOT NULL DEFAULT '{}'::jsonb,          -- { email, pdf, sms, push, website, social }: booleans
  status text NOT NULL DEFAULT 'draft',                 -- draft | approved | scheduled | sending | sent
  scheduled_for timestamptz,
  website_slug text UNIQUE,
  website_published_at timestamptz,
  cache jsonb NOT NULL DEFAULT '{}'::jsonb,             -- personalised commentary per set of areas, kept between batches
  created_by text, approved_by text, approved_at timestamptz, sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publications_status_idx ON public.publications (status, scheduled_for);

-- one row per person per channel: who got what, when, or why not
CREATE TABLE IF NOT EXISTS public.publication_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  channel text NOT NULL,                                -- email | sms | push
  person_id uuid, name text, address text,
  status text NOT NULL,                                 -- sent | failed | skipped
  note text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publication_sends_pub_idx ON public.publication_sends (publication_id, channel);

-- people who've asked not to get marketing (PECR: honoured on every send, from every channel)
CREATE TABLE IF NOT EXISTS public.comms_optouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text, phone text, person_id uuid,
  kind text NOT NULL DEFAULT 'marketing',
  source text,                                          -- unsubscribe link | office | reply
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS comms_optouts_email_idx ON public.comms_optouts (lower(email), kind) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS comms_optouts_phone_idx ON public.comms_optouts (phone, kind) WHERE phone IS NOT NULL;

ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_optouts ENABLE ROW LEVEL SECURITY;
-- read and written only through the office's own routes (service key); nothing for the public or other roles
