-- 246 — Tenants are emailed (26 Oct 2026). people.notify_by_email defaults to off and no screen ever turned it on, so
-- every tenant had it off (67 of 67) and every tenant email that respects it — clean booked / finished / late, repair
-- finished, viewing booked — silently went to nobody. Migration 220 fixed the same thing for contractors. Nobody
-- chose "off": there has never been a control for it. New people start with it on (219 says "all on unless turned
-- off"). Automatic tenant messages are still held by the pause switch (Settings) until it's turned on.
-- Safe to run more than once.
UPDATE public.people SET notify_by_email = TRUE WHERE role = 'tenant' AND notify_by_email IS DISTINCT FROM TRUE;
ALTER TABLE public.people ALTER COLUMN notify_by_email SET DEFAULT TRUE;
