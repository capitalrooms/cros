-- 275 (9 Nov 2026, Harry: "build them both so the site is true")
-- 1. Inspection reports: a property inspection with each area's condition, notes and photos, sent to the landlord as a
--    private report page.
-- 2. Landlord approval of repairs: a per-property limit; a quote over it waits for the landlord, who sees every quote
--    side by side and approves one (or declines) from a private page.
CREATE TABLE IF NOT EXISTS public.property_inspections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'routine' CHECK (kind IN ('routine', 'check_in', 'check_out', 'other')),
  inspected_on  date NOT NULL DEFAULT current_date,
  inspected_by  text,
  overall       text CHECK (overall IS NULL OR overall IN ('good', 'fair', 'needs_work')),
  summary       text,
  areas         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ name, condition: good|fair|needs_work, note, photos: [storage path] }]
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  token         text UNIQUE,
  sent_at       timestamptz,
  sent_to       text[],
  viewed_at     timestamptz,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_inspections_property ON public.property_inspections (property_id, inspected_on DESC);
ALTER TABLE public.property_inspections ENABLE ROW LEVEL SECURITY;   -- server only (service key); no public policies

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS repair_approval_limit numeric CHECK (repair_approval_limit IS NULL OR repair_approval_limit >= 0);

CREATE TABLE IF NOT EXISTS public.repair_approvals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             uuid NOT NULL,
  property_id           uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  recommended_quote_id  uuid,
  chosen_quote_id       uuid,
  amount                numeric,
  token                 text NOT NULL UNIQUE,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  sent_to               text[],
  requested_by          text,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  viewed_at             timestamptz,
  decided_at            timestamptz,
  decided_note          text
);
CREATE INDEX IF NOT EXISTS repair_approvals_ticket ON public.repair_approvals (ticket_id, requested_at DESC);
ALTER TABLE public.repair_approvals ENABLE ROW LEVEL SECURITY;      -- server only
