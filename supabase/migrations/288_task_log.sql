-- 288 — the task bar's history (13 Nov 2026): what was asked, what CROS proposed, and what was actually done.
-- Written by the server only (service key); administrators read it through /api/admin/task.
CREATE TABLE IF NOT EXISTS public.task_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by text NOT NULL,                       -- who asked (their email)
  text text NOT NULL,                             -- what they typed
  reply text,                                     -- CROS's answer or question
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,     -- the cards proposed: [{ kind, title }]
  results jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { "<card index>": { state: 'done'|'error', note, at } }
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_log_created_idx ON public.task_log (created_at DESC);
ALTER TABLE public.task_log ENABLE ROW LEVEL SECURITY;   -- no policies: only the server reads and writes it
