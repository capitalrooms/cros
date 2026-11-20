-- Contractor-started quote requests (Nov 2026). A contractor can ask the office to price work they've discussed on the
-- phone, at any time, even with no open jobs. Nothing is sent to anyone until the office approves it.
--   • property_id is optional: a house on the system, or an address typed in (not on the system yet).
--   • status: 'awaiting_office' (new) → 'approved' (office approved; quotes asked) | 'declined' | 'withdrawn'.
--   • On approval the office links it to a job (ticket_id) and asks contractors for prices via the normal quote flow.
-- Not applied to any database yet — run only with Harry's go-ahead.

CREATE TABLE IF NOT EXISTS public.contractor_quote_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id   uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  property_id     uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  unlisted_address text,
  postcode        text,
  work            text NOT NULL,
  reason          text,
  status          text NOT NULL DEFAULT 'awaiting_office'
                  CHECK (status IN ('awaiting_office', 'approved', 'declined', 'withdrawn')),
  ticket_id       uuid REFERENCES public.maintenance_tickets(id) ON DELETE SET NULL,
  office_note     text,
  decided_by      uuid REFERENCES public.people(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (property_id IS NOT NULL OR (unlisted_address IS NOT NULL AND length(trim(unlisted_address)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_cqr_contractor ON public.contractor_quote_requests(contractor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cqr_status ON public.contractor_quote_requests(status);

-- Access goes through the server (service role). Row-level security stays on with no policies, so the browser
-- cannot read or write this table directly.
ALTER TABLE public.contractor_quote_requests ENABLE ROW LEVEL SECURITY;
