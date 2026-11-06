-- 271 — what the adverts are written from (6 Nov 2026). The answers to the advert's questions are kept where they
-- belong: about the bedroom on the room (rooms.advert_facts — Harry: "any information on the bedroom itself is saved to
-- that individual bedroom"), about the house and area on the house (properties.advert_facts), so they're asked once
-- and reused for every room. rooms.adverts holds the last generated set (summary, website, SpareRoom, Facebook).
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS advert_facts jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS adverts jsonb;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS advert_facts jsonb NOT NULL DEFAULT '{}';
