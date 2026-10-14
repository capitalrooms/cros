-- 223 — Shared planner: a status and a person on each entry, changeable from the grid (14 Oct 2026, Harry: "more
-- monday.com"). Until now a board brought in from the office Planner carried them as a first line of text
-- ("In progress · Damian"); this moves that line into the two new columns and takes it off the description.
-- ADDITIVE. Idempotent: safe to run more than once.

ALTER TABLE public.planner_shared_entries ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE public.planner_shared_entries ADD COLUMN IF NOT EXISTS responsible TEXT;
ALTER TABLE public.planner_shared_entries ADD COLUMN IF NOT EXISTS due_note TEXT;   -- "Spring 26", "Nov": a when that isn't a date

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planner_shared_entries_stage_check') THEN
    ALTER TABLE public.planner_shared_entries ADD CONSTRAINT planner_shared_entries_stage_check
      CHECK (stage IS NULL OR stage IN ('discuss', 'discussed', 'progress', 'parked'));
  END IF;
END $$;

-- the first line "To discuss · Harry · Spring 26" → stage 'discuss', person 'Harry', due_note 'Spring 26'; the line comes
-- off the description
WITH parsed AS (
  SELECT id,
         split_part(split_part(body, E'\n', 1), ' · ', 1) AS label,
         split_part(split_part(body, E'\n', 1), ' · ', 2) AS p2,
         split_part(body, E'\n', 1) AS line,
         CASE WHEN position(E'\n' IN body) > 0 THEN substr(body, position(E'\n' IN body) + 1) ELSE '' END AS rest
    FROM public.planner_shared_entries
   WHERE stage IS NULL
     AND split_part(split_part(body, E'\n', 1), ' · ', 1) IN ('To discuss', 'Discussed', 'In progress', 'Parked')
)
UPDATE public.planner_shared_entries e
   SET stage = CASE p.label WHEN 'To discuss' THEN 'discuss' WHEN 'Discussed' THEN 'discussed' WHEN 'In progress' THEN 'progress' ELSE 'parked' END,
       responsible = CASE WHEN p.p2 <> '' AND p.p2 !~ '\d' AND p.p2 !~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|autumn|winter|q[1-4]|tbc|asap)' THEN p.p2 ELSE e.responsible END,
       due_note = NULLIF(array_to_string((string_to_array(p.line, ' · '))[(CASE WHEN p.p2 <> '' AND p.p2 !~ '\d' AND p.p2 !~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|autumn|winter|q[1-4]|tbc|asap)' THEN 3 ELSE 2 END):], ' · '), ''),
       body = p.rest
  FROM parsed p
 WHERE e.id = p.id;
