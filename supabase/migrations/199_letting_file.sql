-- 199 — The letting file (/admin/lettings/<tenancy>): one page per tenancy from let agreed to moved out.
--
-- The tenancy is created when the holding deposit is recorded (let agreed), with a future start date. These columns
-- record each step to move-in, so the file can show where a letting has got to and what's next:
--   referencing (Homeppl) sent / passed · Right to Rent checked · agreement sent / signed · move-in monies received
--   · keys handed over. Deposit protection already has its own columns (deposit_protected_at, deposit_scheme_ref…).
-- A let that falls through is cancelled (never deleted): let_cancelled_at + reason, and its end date set so it drops
-- out of every "current" list.
-- tenancy_events is the file's activity log: who did what, when.
-- generated_documents.tenancy_id lets letters, invoices and receipts made for a tenancy show in its file.

ALTER TABLE public.tenancies
  ADD COLUMN IF NOT EXISTS applicant_id               UUID REFERENCES public.applicants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referencing_sent_at        DATE,
  ADD COLUMN IF NOT EXISTS referencing_passed_at      DATE,
  ADD COLUMN IF NOT EXISTS right_to_rent_checked_at   DATE,
  ADD COLUMN IF NOT EXISTS agreement_sent_at          DATE,
  ADD COLUMN IF NOT EXISTS agreement_signed_at        DATE,
  ADD COLUMN IF NOT EXISTS move_in_monies_received_at DATE,
  ADD COLUMN IF NOT EXISTS keys_handed_at             DATE,
  ADD COLUMN IF NOT EXISTS let_cancelled_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS let_cancelled_reason       TEXT,
  ADD COLUMN IF NOT EXISTS let_cancelled_by           TEXT;
CREATE INDEX IF NOT EXISTS tenancies_applicant_idx ON public.tenancies (applicant_id);

-- Tenancies already made from an applicant: link them back
UPDATE public.tenancies t SET applicant_id = a.id
  FROM public.applicants a
 WHERE t.applicant_id IS NULL AND a.converted_person_id = t.person_id AND a.room_id = t.room_id;

CREATE TABLE IF NOT EXISTS public.tenancy_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id  UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                 -- e.g. step:referencing_sent, step_undone:keys_handed, terms, cancelled, created
  note        TEXT NOT NULL DEFAULT '',
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  by_email    TEXT
);
CREATE INDEX IF NOT EXISTS tenancy_events_tenancy_idx ON public.tenancy_events (tenancy_id, at DESC);
ALTER TABLE public.tenancy_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads tenancy events" ON public.tenancy_events;
CREATE POLICY "office reads tenancy events" ON public.tenancy_events FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
REVOKE ALL ON public.tenancy_events FROM anon;

ALTER TABLE public.generated_documents ADD COLUMN IF NOT EXISTS tenancy_id UUID REFERENCES public.tenancies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS generated_documents_tenancy_idx ON public.generated_documents (tenancy_id) WHERE tenancy_id IS NOT NULL;
