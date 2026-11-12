-- 282 (12 Nov 2026, Harry: "a form to send to landlords so we can market their property on Rightmove as per OpenRent
-- required docs"). Rightmove (through OpenRent) wants, before a listing goes up: a signed letter of authority from the
-- landlord, proof of ownership (Land Registry title, insurance certificate, solicitor's completion letter or mortgage
-- letter) and photo ID. One request per property, sent to the landlord as a link (/portal-docs/<token>); their uploads
-- go to the private landlord-docs store (ID and ownership encrypted). Server only — the public page works through the
-- token, the office through /api/admin/portal-docs.
CREATE TABLE IF NOT EXISTS public.portal_authority_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL UNIQUE,
  property_id     uuid NOT NULL REFERENCES public.properties(id),
  landlord_id     uuid REFERENCES public.people(id),
  ownership_type  text,
  letter_path     text,
  ownership_path  text,
  id_path         text,
  status          text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'completed')),
  sent_to         text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS portal_authority_property_idx ON public.portal_authority_requests (property_id, created_at DESC);
ALTER TABLE public.portal_authority_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_authority_requests FROM anon;
