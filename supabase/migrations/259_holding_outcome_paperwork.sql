-- 259: paperwork for a holding deposit's outcome (3 Nov 2026). Tenant Fees Act 2019 sch.2: a holding deposit may only
-- be kept for one of four reasons, and the applicant must be told in writing why within 7 days of deciding to keep
-- it. A refund is recorded with how it was paid back. ADDITIVE, idempotent: safe to run more than once.
ALTER TABLE public.holding_deposits
  ADD COLUMN IF NOT EXISTS retain_ground    text,          -- right_to_rent | false_information | withdrew | deadline
  ADD COLUMN IF NOT EXISTS notice_sent_at   timestamptz,   -- the written reasons emailed to the applicant
  ADD COLUMN IF NOT EXISTS notice_sent_to   text,
  ADD COLUMN IF NOT EXISTS refund_reference text;          -- the bank payment reference the refund went with
