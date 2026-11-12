-- 277 (12 Nov 2026, Harry: "populate the marketing adverts with information about the housemates which they have
-- uploaded … e.g. tenants in other rooms in house"). A tenant's "say hello" answers are only shared with their
-- housemates (visible_to_housemates). Showing a short intro on a PUBLIC advert for an empty room in their house needs
-- its own yes, so this is a separate opt-in, off unless they tick it. The advert never shows their name or photo —
-- only what they do, where they're from, weekends, early bird / night owl, how they are with housemates, and their
-- chosen avatar (lib/housemates/adverts).
ALTER TABLE public.tenant_icebreakers ADD COLUMN IF NOT EXISTS show_on_adverts boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tenant_icebreakers.show_on_adverts IS 'Tenant agreed to a short, nameless intro on adverts for empty rooms in their house';
