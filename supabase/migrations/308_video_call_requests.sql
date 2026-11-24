-- 308 — informal video call between the applicant and the landlord, after the holding deposit is paid (24 Nov 2026).
-- Flow: landlord ticks free times → applicant picks one of them → landlord and applicant get the details →
-- 20 minutes after the call the landlord is asked whether to proceed. Staff see it on the applicant's file.
CREATE TABLE IF NOT EXISTS public.video_call_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_email     TEXT NOT NULL,
  applicant_name      TEXT,
  landlord_id         UUID REFERENCES public.people(id),
  property_id         UUID REFERENCES public.properties(id),
  room_id             UUID REFERENCES public.rooms(id),
  status              TEXT NOT NULL DEFAULT 'awaiting_landlord_times' CHECK (status IN (
                        'awaiting_landlord_times', 'times_offered', 'booked', 'needs_new_times', 'closed')),
  landlord_slots      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ISO times the landlord has ticked as free
  chosen_slot         TIMESTAMPTZ,                          -- the time the applicant picked
  offered_at          TIMESTAMPTZ,
  reminded_applicant  TIMESTAMPTZ,                          -- 6-hour reminder sent
  reminded_office     TIMESTAMPTZ,                          -- office told nobody picked a time
  followup_sent       TIMESTAMPTZ,                          -- "how did it go?" to the landlord
  outcome             TEXT CHECK (outcome IS NULL OR outcome IN ('proceed', 'decline', 'notes')),
  outcome_note        TEXT,
  rounds              INTEGER NOT NULL DEFAULT 0,           -- times the applicant asked for new times
  landlord_token      TEXT NOT NULL UNIQUE,
  applicant_token     TEXT NOT NULL UNIQUE,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_call_requests_status_idx ON public.video_call_requests (status);
ALTER TABLE public.video_call_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads and writes video calls" ON public.video_call_requests;
CREATE POLICY "office reads and writes video calls" ON public.video_call_requests FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
