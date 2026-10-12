-- 215 — Who lives in each let-only room (Harry, 12 Oct 2026). Let-only landlords (e.g. Nigel) send a list of who is in
-- each room; CROS keeps it for reference — name, phone, move-in date, rent — against the room. Deliberately NOT a
-- tenancy: we don't collect their rent, so nothing here may reach rent charges, statements or the rent roll.
-- One current occupant per room (ended_at null); a new name for the room ends the previous one (kept as history).
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.let_only_occupants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id),
  room_id     UUID NOT NULL REFERENCES public.rooms(id),
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  move_in     DATE,
  rent        NUMERIC(10,2),
  note        TEXT,
  source      TEXT,                       -- e.g. "Landlord's list, 12 Oct 2026"
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    DATE
);
CREATE INDEX IF NOT EXISTS let_only_occupants_room_idx ON public.let_only_occupants (room_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS let_only_occupants_property_idx ON public.let_only_occupants (property_id);

-- office only (administrators and lettings), like the rest of the lettings records
ALTER TABLE public.let_only_occupants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages let-only occupants" ON public.let_only_occupants;
CREATE POLICY "office manages let-only occupants" ON public.let_only_occupants FOR ALL TO authenticated
  USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
REVOKE ALL ON public.let_only_occupants FROM anon;
