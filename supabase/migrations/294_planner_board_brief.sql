-- 294 — a shared planner board's header: what it's for, with photos (17 Nov 2026, Harry: "the header for a list can
-- have notes and photos for it to summarise the project or purpose"). Copied from the office planner board it's linked
-- to (lib/planner/importBoard syncLinkedBoards). { notes, photos: [planner-files paths] }. Idempotent.
ALTER TABLE public.planner_shared_boards ADD COLUMN IF NOT EXISTS brief JSONB;
