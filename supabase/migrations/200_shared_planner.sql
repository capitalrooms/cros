-- 200 — Shared planner: a board between the office and one person (a cleaner, contractor or lettings user now;
-- chosen landlords later). The office posts entries — a note about a property, a job to look at, a photo idea, links —
-- and the person replies underneath and ticks them off. Each side gets a notification when the other posts.
-- The office's own Planner (the boards file) is separate and unchanged.
-- Everything goes through /api/planner/shared with the service key, which checks who may see which board, so
-- nobody reads these tables directly from the browser.

CREATE TABLE IF NOT EXISTS public.planner_shared_boards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_person_id  UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'staff' CHECK (kind IN ('staff', 'landlord')),
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS planner_shared_boards_one_per_person ON public.planner_shared_boards (member_person_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.planner_shared_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     UUID NOT NULL REFERENCES public.planner_shared_boards(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  property_id  UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  ticket_id    UUID REFERENCES public.maintenance_tickets(id) ON DELETE SET NULL,
  due_date     DATE,
  links        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ["https://…"]
  photos       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- storage paths in planner-files
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_by   UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at      TIMESTAMPTZ,
  done_by      UUID REFERENCES public.people(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS planner_shared_entries_board_idx ON public.planner_shared_entries (board_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.planner_shared_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID NOT NULL REFERENCES public.planner_shared_entries(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES public.people(id) ON DELETE SET NULL,
  body        TEXT NOT NULL DEFAULT '',
  links       JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planner_shared_replies_entry_idx ON public.planner_shared_replies (entry_id, created_at);

ALTER TABLE public.planner_shared_boards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_shared_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_shared_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planner_shared_boards, public.planner_shared_entries, public.planner_shared_replies FROM anon;

-- Photos: a private bucket, opened through short-lived signed links
INSERT INTO storage.buckets (id, name, public) VALUES ('planner-files', 'planner-files', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;
