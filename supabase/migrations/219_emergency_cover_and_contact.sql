-- 219 — Emergency cover by house, and how each contractor wants to hear from us (Harry, 13 Oct 2026:
-- "some place to say what contractors can do what emergency cover for what properties so they will get the text out,
-- push notification or email depending on preferences").
--
-- emergency_contractors.property_ids — the houses a contractor covers; empty = every house (as before).
-- people.notify_by_sms / notify_by_push — alongside the existing notify_by_email; all on unless turned off.
-- Safe to run more than once.

ALTER TABLE public.emergency_contractors ADD COLUMN IF NOT EXISTS property_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS notify_by_sms  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS notify_by_push BOOLEAN NOT NULL DEFAULT TRUE;
