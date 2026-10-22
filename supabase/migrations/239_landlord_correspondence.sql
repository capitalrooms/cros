-- 239 — How a landlord wants to hear from us, and who else gets copied (22 Oct 2026, Harry: "see if they want
-- accountants or anyone else CC'd in on their correspondence … landlords can tell us if they are happy with just a push
-- that they have a record of inside the app or whether they want an email too or email only").
--   people.contact_pref       'app_and_email' (default) | 'app_only' | 'email_only'
--   people.correspondence_cc  [{ "name": "…", "email": "…", "role": "Accountant" }] — copied on statements, invoices
--                             and letters to this landlord (shown, and changeable, before each send)
-- Set on the landlord's profile → Correspondence. Idempotent: safe to run more than once.
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS contact_pref TEXT NOT NULL DEFAULT 'app_and_email';
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS correspondence_cc JSONB NOT NULL DEFAULT '[]'::jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_contact_pref') THEN
    ALTER TABLE public.people ADD CONSTRAINT people_contact_pref CHECK (contact_pref IN ('app_and_email', 'app_only', 'email_only'));
  END IF;
END $$;
