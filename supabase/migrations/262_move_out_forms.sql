-- 262 · Move-out form answers (4 Nov 2026, Harry: "you send a form but it can't easily be filled in … can the tenants
-- book a cleaner for their final day which we will deduct from their deposit — £20 per hour").
-- The tenant fills an online form from the move-out email (/moveout/<signed link>): forwarding address and contacts,
-- meter readings (whole homes), keys, anything broken, the checklist — and can book our cleaner for their last day at
-- £20 an hour, agreeing it comes off their deposit. One row per tenancy; sending it again updates it.
CREATE TABLE IF NOT EXISTS public.move_out_forms (
  tenancy_id        uuid PRIMARY KEY REFERENCES public.tenancies(id) ON DELETE CASCADE,
  answers           jsonb NOT NULL DEFAULT '{}'::jsonb,
  cleaner_hours     numeric(4,1),            -- null = no clean booked
  cleaner_rate      numeric(8,2),            -- the hourly rate they agreed to (£20 when introduced)
  cleaner_agreed_at timestamptz,             -- when they ticked "take it from my deposit"
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.move_out_forms ENABLE ROW LEVEL SECURITY;
-- read and written only by the server (service role); office screens read it through the API
DROP POLICY IF EXISTS move_out_forms_none ON public.move_out_forms;
CREATE POLICY move_out_forms_none ON public.move_out_forms FOR SELECT USING (false);

