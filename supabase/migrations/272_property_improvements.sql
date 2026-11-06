-- 272 — things that could be improved, noted on a visit (6 Nov 2026, Harry: "needs a new carpet … bedroom needs a chest of
-- drawers … the lounge is a little cluttered"). Each belongs to the house (a shared area) or one room. From here the
-- office sends them, written up properly, to the landlord to approve or to a contractor to quote; redesign images
-- (OpenAI, lib/house/redesign) can be attached to show what it could look like.
CREATE TABLE IF NOT EXISTS public.property_improvements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id       uuid REFERENCES public.rooms(id) ON DELETE CASCADE,     -- null = the house / a shared area
  area          text,                       -- kitchen, lounge, hallway… when not a bedroom
  note          text NOT NULL,              -- as the person wrote it
  status        text NOT NULL DEFAULT 'noted' CHECK (status IN ('noted', 'sent_to_landlord', 'approved', 'quoting', 'done', 'dismissed')),
  designs       jsonb NOT NULL DEFAULT '[]',   -- [{ path, style, brief, cost }] — redesign images
  sent_log      jsonb NOT NULL DEFAULT '[]',   -- [{ to, kind, at, by }]
  added_by      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_improvements_property ON public.property_improvements (property_id);
ALTER TABLE public.property_improvements ENABLE ROW LEVEL SECURITY;
