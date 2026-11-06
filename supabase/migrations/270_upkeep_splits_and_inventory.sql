-- 270 (6 Nov 2026)
-- 1. upkeep_splits — how one expense or statement line that names several parts of the house ("repair wardrobe in
--    Room 2, fix kitchen sink") is divided between them. Without one, it's split equally (lib/property/upkeep).
CREATE TABLE IF NOT EXISTS public.upkeep_splits (
  source     text NOT NULL CHECK (source IN ('expense', 'statement')),
  line_id    uuid NOT NULL,
  splits     jsonb NOT NULL,          -- [{ "area": "kitchen", "amount": 120.00 }, { "area": "room-2", "amount": 60.00 }]
  set_by     text,
  set_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, line_id)
);
ALTER TABLE public.upkeep_splits ENABLE ROW LEVEL SECURITY;

-- 2. room_inventory — what's in each room and the shared areas, built up from photos (marketing photos included):
--    "white IKEA Malm chest of drawers", matched to the expense it was bought with when there is one, otherwise sent
--    to the office to confirm roughly when it was bought.
CREATE TABLE IF NOT EXISTS public.room_inventory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id       uuid REFERENCES public.rooms(id) ON DELETE SET NULL,     -- null = a shared area
  area          text,                    -- kitchen, lounge, hallway… when not a bedroom
  item          text NOT NULL,           -- "Chest of drawers"
  description   text,                    -- "White IKEA Malm, 6 drawers"
  bulb          text,                    -- for lights: the bulb it takes
  bought_on     date,
  bought_note   text,
  bought_approx boolean NOT NULL DEFAULT false,   -- a year someone remembered, not a receipt
  expense_id    uuid,
  statement_line_id uuid,
  needs_date    boolean NOT NULL DEFAULT true,    -- in the office's "when was this bought?" list
  added_by      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS room_inventory_property ON public.room_inventory (property_id) WHERE removed_at IS NULL;
ALTER TABLE public.room_inventory ENABLE ROW LEVEL SECURITY;
