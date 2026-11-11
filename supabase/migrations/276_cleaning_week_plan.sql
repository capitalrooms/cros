-- 276 (11 Nov 2026, Harry: "send the cleaners automated emails on Monday or Sunday evening to confirm that this week
-- they must book in their designated cleans … and how an additional task is added, e.g. clean room 3 which is empty.
-- Then I don't have to chase people and remind them each week.")
--
-- 1. How long each house's regular clean takes (hours), next to its cleaner / how often / day / time (243, 245).
-- 2. One-off extra tasks for a given week at a house ("Room 3 is empty — clean it ready for viewings"), optionally for
--    a room and with extra time. They go in that week's email and show on the cleaner's clean for that week.
-- 3. A record of each weekly email sent (one per cleaner per week), so a re-run never sends twice.
-- The send day itself is a setting: system_settings 'cleaner_week_email' = off (default) | sunday | monday.

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS clean_hours numeric CHECK (clean_hours IS NULL OR (clean_hours > 0 AND clean_hours <= 12));

CREATE TABLE IF NOT EXISTS public.clean_week_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id      uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  week_start   date NOT NULL,                       -- the Monday of the week it's for
  task         text NOT NULL CHECK (length(task) BETWEEN 1 AND 300),
  extra_hours  numeric CHECK (extra_hours IS NULL OR (extra_hours > 0 AND extra_hours <= 12)),
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS clean_week_tasks_week ON public.clean_week_tasks (week_start, property_id);
ALTER TABLE public.clean_week_tasks ENABLE ROW LEVEL SECURITY;   -- server only (service key); no public policies

CREATE TABLE IF NOT EXISTS public.clean_week_emails (
  week_start  date NOT NULL,
  cleaner_id  uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  sent_to     text,
  houses      int,
  PRIMARY KEY (week_start, cleaner_id)
);
ALTER TABLE public.clean_week_emails ENABLE ROW LEVEL SECURITY;  -- server only

INSERT INTO public.system_settings (key, value) VALUES ('cleaner_week_email', 'off') ON CONFLICT (key) DO NOTHING;
