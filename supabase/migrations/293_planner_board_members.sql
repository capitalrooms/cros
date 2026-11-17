-- 293 — one shared planner board, two or three people on it (17 Nov 2026, Harry: "I just want one board to be editable
-- by two or three people"). The board's first person stays planner_shared_boards.member_person_id; the others are here.
-- Each person gets their own no-sign-in link (lib/planner/link), so their notes and replies carry their name. Idempotent.
CREATE TABLE IF NOT EXISTS public.planner_board_members (
  board_id  UUID NOT NULL REFERENCES public.planner_shared_boards(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  added_by  TEXT,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, person_id)
);
CREATE INDEX IF NOT EXISTS planner_board_members_person ON public.planner_board_members(person_id);
ALTER TABLE public.planner_board_members ENABLE ROW LEVEL SECURITY;   -- server (service key) only

-- A shared board brought in from the office's own Planner stays LINKED to it (17 Nov 2026, Harry: "I added two entries
-- … it wants me to resend those entries rather than just update the board for everyone"). Saving the office board
-- updates the shared one: new items appear, titles/status/person/dates follow, new updates arrive as replies.
ALTER TABLE public.planner_shared_boards  ADD COLUMN IF NOT EXISTS source_board_id  TEXT;
ALTER TABLE public.planner_shared_entries ADD COLUMN IF NOT EXISTS source_item_id   TEXT;
ALTER TABLE public.planner_shared_replies ADD COLUMN IF NOT EXISTS source_update_id TEXT;
CREATE INDEX IF NOT EXISTS planner_shared_boards_source ON public.planner_shared_boards(source_board_id);
