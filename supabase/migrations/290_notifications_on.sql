-- 290 — Everyone starts with every notification on (14 Nov 2026, Harry: "all users should start with all push
-- notifications and then they work out which ones they don't need and turn them off"). The columns already default to
-- on; cleaners' email was left off by an old default that nobody chose, so it's switched on here. People who turned
-- something off themselves are left as they are.
ALTER TABLE public.people ALTER COLUMN notify_by_push SET DEFAULT TRUE;
ALTER TABLE public.people ALTER COLUMN notify_by_sms SET DEFAULT TRUE;
ALTER TABLE public.people ALTER COLUMN notify_by_email SET DEFAULT TRUE;
UPDATE public.people SET notify_by_email = TRUE WHERE role = 'cleaner' AND notify_by_email = FALSE;
