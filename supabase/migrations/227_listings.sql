-- 227 — Listings (17 Oct 2026, Harry: "go with B and C, start the listing record").
--
-- One listing per room (or per whole unit for a single let) per marketing period, stored in the shape portal feeds
-- use (Rightmove's Real Time Datafeed, Zoopla, OnTheMarket), so sending a listing to a portal later is a connection,
-- not a rebuild. Trading Standards' material information is part of the record: Part A (rent, deposit, council tax)
-- must be complete before a listing can be Ready; Parts B and C sit alongside.
--   listings          — the record (status: draft → ready → live → let_agreed → let; or withdrawn)
--   listing_channels  — where it goes (share link, website, Rightmove, Zoopla, OnTheMarket, SpareRoom): on/off, the
--                       reference there, last sent and its result
-- The office (administrator, admin, lettings) manages both; the public share page and website read through the server.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.listings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id              UUID REFERENCES public.rooms(id) ON DELETE SET NULL,          -- null = the whole unit (a single let)
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'live', 'let_agreed', 'let', 'withdrawn')),
  agent_ref            TEXT,                                                          -- our reference on every portal (CR-…)
  -- the advert
  headline             TEXT,
  summary              TEXT,
  description          TEXT,
  features             TEXT[] NOT NULL DEFAULT '{}',                                  -- up to 10 key features (portal limit)
  -- price — material information Part A
  rent                 NUMERIC(10,2),
  rent_frequency       TEXT NOT NULL DEFAULT 'pcm' CHECK (rent_frequency IN ('pcm', 'pw')),
  deposit              NUMERIC(10,2),
  holding_deposit      NUMERIC(10,2),
  bills_included       BOOLEAN,
  council_tax_band     TEXT,
  council_tax_included BOOLEAN,
  -- details — Part B
  property_type        TEXT CHECK (property_type IS NULL OR property_type IN ('house_share', 'flat_share', 'flat', 'house', 'studio', 'maisonette')),
  bedrooms             INT,
  bathrooms            INT,
  room_size_sqm        NUMERIC(6,2),
  ensuite              BOOLEAN,
  furnished            TEXT CHECK (furnished IS NULL OR furnished IN ('furnished', 'part', 'unfurnished')),
  living_room          BOOLEAN,
  parking              TEXT,
  outside_space        TEXT,
  heating              TEXT,
  broadband            TEXT,
  utilities            JSONB NOT NULL DEFAULT '{}'::jsonb,                             -- electricity, water, sewerage, heating supply
  -- terms
  available_from       DATE,
  min_term_months      INT,
  max_term_months      INT,
  let_type             TEXT CHECK (let_type IS NULL OR let_type IN ('long', 'short', 'student')),
  sharers_allowed      BOOLEAN,
  pets_allowed         BOOLEAN,
  smokers_allowed      BOOLEAN,
  tenant_type          TEXT,                                                          -- professionals, students, any
  -- where — the display address is what the public sees (street + district, never a number)
  display_address      TEXT,
  latitude             NUMERIC(9,6),
  longitude            NUMERIC(9,6),
  -- issues — Part C, only where they apply (flood risk, restrictions, accessibility, building safety)
  part_c               JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- media: property_photos ids in the order shown; floor plan, video and tour links
  media_order          UUID[] NOT NULL DEFAULT '{}',
  floorplan_url        TEXT,
  video_url            TEXT,
  virtual_tour_url     TEXT,
  -- life of the listing
  published_at         TIMESTAMPTZ,
  let_agreed_at        TIMESTAMPTZ,
  withdrawn_at         TIMESTAMPTZ,
  created_by           UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_room_idx ON public.listings (room_id);
CREATE INDEX IF NOT EXISTS listings_property_idx ON public.listings (property_id);
CREATE INDEX IF NOT EXISTS listings_status_idx ON public.listings (status);
-- one open listing per room / unit at a time (a let or withdrawn one can be followed by a new one)
CREATE UNIQUE INDEX IF NOT EXISTS listings_one_open_per_room ON public.listings (room_id) WHERE room_id IS NOT NULL AND status NOT IN ('let', 'withdrawn');
CREATE UNIQUE INDEX IF NOT EXISTS listings_one_open_per_unit ON public.listings (property_id) WHERE room_id IS NULL AND status NOT IN ('let', 'withdrawn');
CREATE UNIQUE INDEX IF NOT EXISTS listings_agent_ref ON public.listings (agent_ref) WHERE agent_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.listing_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('share', 'website', 'rightmove', 'zoopla', 'onthemarket', 'spareroom')),
  enabled       BOOLEAN NOT NULL DEFAULT false,
  external_ref  TEXT,                                -- the listing's id on that portal
  status        TEXT,                                -- e.g. sent, live, withdrawn, error
  last_sent_at  TIMESTAMPTZ,
  last_result   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, channel)
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages listings" ON public.listings;
CREATE POLICY "office manages listings" ON public.listings FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));
DROP POLICY IF EXISTS "office manages listing channels" ON public.listing_channels;
CREATE POLICY "office manages listing channels" ON public.listing_channels FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));
REVOKE ALL ON public.listings, public.listing_channels FROM anon;
