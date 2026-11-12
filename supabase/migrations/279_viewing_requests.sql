-- 279 (12 Nov 2026, Harry: "the applicant can request viewing slots — give 3 slots you are free in the next week …
-- evening appointments Monday to Friday up to 6:30pm, lunchtime 12 till 1:30pm, up to 3 slots"). A request from the
-- website's room page (/api/site/viewing-request) waits here until lettings books one of its slots (or declines it).
-- Public can't read or write it directly — only the server route writes, office staff read.
CREATE TABLE IF NOT EXISTS public.viewing_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid REFERENCES public.rooms(id),
  property_id uuid REFERENCES public.properties(id),
  name        text NOT NULL,
  email       text,
  phone       text,
  slots       jsonb NOT NULL DEFAULT '[]',     -- [{ "date": "2026-11-17", "time": "12:30" }, …] up to 3
  message     text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'booked', 'declined')),
  viewing_id  uuid,
  handled_by  text,
  handled_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viewing_requests_new_idx ON public.viewing_requests (created_at DESC) WHERE status = 'new';
ALTER TABLE public.viewing_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads viewing requests" ON public.viewing_requests;
CREATE POLICY "office reads viewing requests" ON public.viewing_requests FOR SELECT TO authenticated USING (public.cros_is_staff());
REVOKE ALL ON public.viewing_requests FROM anon;
