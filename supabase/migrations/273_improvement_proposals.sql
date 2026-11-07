-- 273 — an improvement proposal for a landlord (7 Nov 2026, Harry: "compile 3 or 4 ideas for one room with 3 or 4 designs
-- for the kitchen and email that … to test the waters … what would be your financial ceiling"). A private page
-- (/proposal/<token>) walks them through each space's redesigns; they pick a favourite or "not this one", give a spending
-- ceiling and comments, and the office is told straight away.
CREATE TABLE IF NOT EXISTS public.improvement_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,
  intro         text,
  spaces        jsonb NOT NULL,          -- [{ improvementId, label, note, cost?, designs: [{ path, style, brief, items, cost }] }]
  sent_to       text[],
  sent_by       text,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  viewed_at     timestamptz,
  answers       jsonb,                   -- { spaces: { [improvementId]: { choice: <design index> | 'none', note } }, budget, comments }
  answered_at   timestamptz
);
ALTER TABLE public.improvement_proposals ENABLE ROW LEVEL SECURITY;
