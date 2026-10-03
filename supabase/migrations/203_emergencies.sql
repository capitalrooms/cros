-- 203 — Out-of-hours emergencies, handled without the office having to be online.
-- A tenant's emergency report texts every contractor on the emergency list for that trade; they answer from a link
-- (can attend, when, call-out fee). After a short window CROS confirms the soonest, tells the others it's covered,
-- tells the house, then checks in with the contractor an hour after they were due (on site? done? if not, why, what
-- part, cost of the proper fix, when they can return). The office can watch and step in at any point.
-- Everything is reached through the API (service key); no direct access for signed-in users.

-- Who we call in an emergency, for which trades and when
CREATE TABLE IF NOT EXISTS public.emergency_contractors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     UUID NOT NULL UNIQUE REFERENCES public.people(id) ON DELETE CASCADE,
  trades        TEXT[] NOT NULL DEFAULT '{}',          -- plumbing, electrical, heating, locksmith, roofing, general
  hours_from    SMALLINT NOT NULL DEFAULT 0 CHECK (hours_from BETWEEN 0 AND 23),   -- hours they take emergency calls
  hours_to      SMALLINT NOT NULL DEFAULT 24 CHECK (hours_to BETWEEN 1 AND 24),
  backup_only   BOOLEAN NOT NULL DEFAULT FALSE,        -- only asked when the first wave gets no one
  call_out_fee  NUMERIC(10,2),                         -- their usual emergency call-out, for guidance
  rank          SMALLINT NOT NULL DEFAULT 5,           -- lower = preferred when two can come at the same time
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One emergency (linked to the tenant's maintenance job)
CREATE TABLE IF NOT EXISTS public.emergencies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID REFERENCES public.maintenance_tickets(id) ON DELETE SET NULL,
  property_id         UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id             UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  reporter_id         UUID REFERENCES public.people(id) ON DELETE SET NULL,
  kind                TEXT NOT NULL DEFAULT 'other',      -- flooding, electrical, heating, security, toilet, gas, fire, other
  trade               TEXT NOT NULL DEFAULT 'general',
  title               TEXT NOT NULL DEFAULT '',
  details             TEXT,
  controlled          BOOLEAN NOT NULL DEFAULT FALSE,     -- tenant said it's contained until morning
  status              TEXT NOT NULL DEFAULT 'collecting' CHECK (status IN (
                        'collecting',       -- texts out, waiting for answers
                        'awaiting_office',  -- needs the office (over the cost limit, or no one answered)
                        'assigned',         -- a contractor is confirmed and on the way
                        'on_site',
                        'needs_return',     -- made safe / not fixed; coming back
                        'resolved',
                        'morning',          -- contained — dealt with first thing
                        'call_999',         -- gas / fire: emergency services, not a contractor
                        'office_handling',  -- the office took it over
                        'cancelled')),
  wave                SMALLINT NOT NULL DEFAULT 1,
  window_ends_at      TIMESTAMPTZ,
  chosen_response_id  UUID,
  eta_at              TIMESTAMPTZ,
  call_out_fee        NUMERIC(10,2),
  followup_due_at     TIMESTAMPTZ,
  followup_sent_at    TIMESTAMPTZ,
  followup_reminded_at TIMESTAMPTZ,
  office_alerted_at   TIMESTAMPTZ,
  office_by           TEXT,                              -- who in the office stepped in
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emergencies_open_idx ON public.emergencies (status, window_ends_at) WHERE status NOT IN ('resolved', 'cancelled');

-- Each contractor asked, with their answer and, if chosen, how it went
CREATE TABLE IF NOT EXISTS public.emergency_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id    UUID NOT NULL REFERENCES public.emergencies(id) ON DELETE CASCADE,
  contractor_id   UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,                  -- their link, no sign-in needed
  wave            SMALLINT NOT NULL DEFAULT 1,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  texted          BOOLEAN NOT NULL DEFAULT FALSE,
  opened_at       TIMESTAMPTZ,
  answer          TEXT CHECK (answer IN ('yes', 'no')),
  answered_at     TIMESTAMPTZ,
  eta_at          TIMESTAMPTZ,
  call_out_fee    NUMERIC(10,2),
  note            TEXT,
  chosen_at       TIMESTAMPTZ,
  stood_down_at   TIMESTAMPTZ,                           -- told someone else is covering it
  -- after the visit
  on_site_at      TIMESTAMPTZ,
  outcome         TEXT CHECK (outcome IN ('fixed', 'made_safe', 'not_fixed', 'running_late', 'cant_attend')),
  outcome_note    TEXT,
  part_needed     TEXT,
  fix_cost        NUMERIC(10,2),
  return_date     DATE,
  return_slot     TEXT,
  reported_at     TIMESTAMPTZ,
  UNIQUE (emergency_id, contractor_id)
);
CREATE INDEX IF NOT EXISTS emergency_responses_em_idx ON public.emergency_responses (emergency_id);

-- What happened, in order — the office's view of the whole thing
CREATE TABLE IF NOT EXISTS public.emergency_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id  UUID NOT NULL REFERENCES public.emergencies(id) ON DELETE CASCADE,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind          TEXT NOT NULL,
  note          TEXT NOT NULL,
  by_text       TEXT
);
CREATE INDEX IF NOT EXISTS emergency_events_em_idx ON public.emergency_events (emergency_id, at);

ALTER TABLE public.emergency_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergencies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_events      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emergency_contractors, public.emergencies, public.emergency_responses, public.emergency_events FROM anon, authenticated;

-- Settings (changeable on the Emergencies screen)
INSERT INTO public.system_settings (key, value) VALUES
  ('emergency_auto', 'true'),             -- choose and confirm without the office
  ('emergency_window_min', '10'),         -- how long to collect answers
  ('emergency_cost_limit', '150'),        -- call-outs above this wait for the office…
  ('emergency_over_limit', 'send_after_15'), -- …or go ahead if no one in the office answers in 15 minutes ('wait' = always wait)
  ('emergency_followup_min', '60'),       -- check in this long after they were due
  ('emergency_tenant_updates', 'true')    -- tell the house what's happening, even while other tenant messages are paused
ON CONFLICT (key) DO NOTHING;

-- Run the emergency clock every minute (the free Vercel plan only allows daily jobs). The tick only acts on timers
-- that have run out, so an extra call does no harm. Skipped quietly where pg_cron / pg_net aren't available.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cros-emergency-tick';
  PERFORM cron.schedule('cros-emergency-tick', '* * * * *',
    $job$ SELECT net.http_post(url := 'https://cros-sigma.vercel.app/api/emergencies/tick', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb) $job$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Emergency clock not scheduled (%). The tick still runs whenever an emergency is opened or answered.', SQLERRM;
END $$;
