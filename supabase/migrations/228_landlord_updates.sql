-- 228 — Landlord updates on a new tenant (17 Oct 2026). Harry: "where in the system can we notify the landlord that a
-- new tenant has reserved a room, passed referencing … signed and paid up … a full summary", and "we could do this for
-- let only landlords too especially as nigel likes to review their offer first".
--
--   landlord_updates — every update emailed to a landlord about an incoming tenant, from the offer (for the landlord
--                      to review) to the full new-tenant report. One row per send: who it went to, the stage, and —
--                      when tenant documents were shared — a private link (token) that stops working after 7 days.
--                      On an offer sent for review the landlord can answer on that page (happy / not this one).
-- Office only (administrator, admin, lettings); the landlord's page reads through the server by token.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.landlord_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id    UUID REFERENCES public.applicants(id) ON DELETE SET NULL,
  tenancy_id      UUID REFERENCES public.tenancies(id) ON DELETE SET NULL,
  landlord_id     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  stage           TEXT NOT NULL CHECK (stage IN ('offer', 'reserved', 'referenced', 'signed_paid', 'summary')),
  sent_to         TEXT[] NOT NULL DEFAULT '{}',
  subject         TEXT,
  facts           JSONB NOT NULL DEFAULT '[]'::jsonb,      -- the label / value lines shown to the landlord
  doc_ids         UUID[] NOT NULL DEFAULT '{}',            -- property_documents shared on the private page
  share_token     TEXT UNIQUE,
  share_expires_at TIMESTAMPTZ,
  first_viewed_at TIMESTAMPTZ,
  answer          TEXT CHECK (answer IS NULL OR answer IN ('approved', 'declined')),
  answer_note     TEXT,
  answered_at     TIMESTAMPTZ,
  sent_by         TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS landlord_updates_applicant_idx ON public.landlord_updates (applicant_id);
CREATE INDEX IF NOT EXISTS landlord_updates_tenancy_idx ON public.landlord_updates (tenancy_id);

ALTER TABLE public.landlord_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages landlord updates" ON public.landlord_updates;
CREATE POLICY "office manages landlord updates" ON public.landlord_updates FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));
REVOKE ALL ON public.landlord_updates FROM anon;
