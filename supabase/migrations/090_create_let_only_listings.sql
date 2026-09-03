-- Migration 090: Let-only listings
-- Lightweight property listings for landlord-marketed properties not managed by Capital Rooms.
-- No compliance tracking, no maintenance, no tenancy records — just marketing, viewings, and remaining tenant notifications.

-- ── Add 3-state room detail tag columns to managed rooms ──────────────────────
-- All three columns: has_ensuite, has_shared_bathroom, has_lounge
-- NULL = "not specified", true = yes, false = no
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS has_ensuite         BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_shared_bathroom BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_lounge          BOOLEAN DEFAULT NULL;

-- ── Let-only listings (property level) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.let_only_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address         TEXT    NOT NULL,
  postcode        VARCHAR(20),
  landlord_name   TEXT,
  landlord_phone  TEXT,
  landlord_email  TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID    REFERENCES public.people(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Let-only rooms (can be multiple rooms per listing) ────────────────────────
CREATE TABLE IF NOT EXISTS public.let_only_rooms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       UUID    NOT NULL REFERENCES public.let_only_listings(id) ON DELETE CASCADE,
  room_name        TEXT    NOT NULL DEFAULT 'Room',
  monthly_rent     NUMERIC(10,2),
  available_date   DATE,
  status           VARCHAR(50) NOT NULL DEFAULT 'available', -- 'available', 'let', 'withdrawn'

  -- 3-state room detail tags (true=yes, false=no, null=not specified/unknown)
  has_ensuite          BOOLEAN DEFAULT NULL,
  has_shared_bathroom  BOOLEAN DEFAULT NULL,
  has_lounge           BOOLEAN DEFAULT NULL,

  description      TEXT,
  photos           JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_let_only_rooms_listing_id ON public.let_only_rooms(listing_id);
CREATE INDEX IF NOT EXISTS idx_let_only_rooms_status     ON public.let_only_rooms(status);

-- ── Remaining tenant contacts at let-only properties ─────────────────────────
-- These are NOT CROS users — no account, no login, contact details only.
CREATE TABLE IF NOT EXISTS public.let_only_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID    NOT NULL REFERENCES public.let_only_listings(id) ON DELETE CASCADE,
  full_name       TEXT    NOT NULL,
  email           TEXT,
  phone           TEXT,
  room_info       TEXT,  -- e.g. "Room 2", "Front bedroom"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_let_only_contacts_listing_id ON public.let_only_contacts(listing_id);

-- ── Link viewings to let-only rooms ──────────────────────────────────────────
ALTER TABLE public.viewings
  ADD COLUMN IF NOT EXISTS let_only_room_id UUID REFERENCES public.let_only_rooms(id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.let_only_listings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.let_only_rooms     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.let_only_contacts  ENABLE ROW LEVEL SECURITY;

-- Admin and lettings can read/write all (permissive — same pattern as other tables)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'let_only_listings'
    AND policyname = 'let_only_listings_admin_lettings'
  ) THEN
    EXECUTE 'CREATE POLICY "let_only_listings_admin_lettings"
      ON public.let_only_listings FOR ALL
      USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'let_only_rooms'
    AND policyname = 'let_only_rooms_admin_lettings'
  ) THEN
    EXECUTE 'CREATE POLICY "let_only_rooms_admin_lettings"
      ON public.let_only_rooms FOR ALL
      USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'let_only_contacts'
    AND policyname = 'let_only_contacts_admin_lettings'
  ) THEN
    EXECUTE 'CREATE POLICY "let_only_contacts_admin_lettings"
      ON public.let_only_contacts FOR ALL
      USING (true) WITH CHECK (true)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
