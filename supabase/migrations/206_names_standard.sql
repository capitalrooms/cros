-- 206 — Names the same way everywhere: title (salutation), first name, middle name(s), surname.
-- People already have salutation / first_name / last_name; add middle_name (asked for tenants, used on agreements).
-- Applicants only had full_name: give them the same parts, filled from full_name for the ones already in.

ALTER TABLE public.people     ADD COLUMN IF NOT EXISTS middle_name TEXT;

ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS salutation  TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS first_name  TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS last_name   TEXT;

-- existing applicants: "Mr James Smith" → Mr / James / Smith (a leading title is recognised; the rest is the surname)
UPDATE public.applicants a SET
  salutation = CASE WHEN split_part(trim(a.full_name), ' ', 1) IN ('Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev') THEN split_part(trim(a.full_name), ' ', 1) END,
  first_name = CASE WHEN split_part(trim(a.full_name), ' ', 1) IN ('Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev')
                    THEN split_part(trim(a.full_name), ' ', 2) ELSE split_part(trim(a.full_name), ' ', 1) END,
  last_name  = NULLIF(trim(regexp_replace(trim(a.full_name), CASE WHEN split_part(trim(a.full_name), ' ', 1) IN ('Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev') THEN '^\S+\s+\S+' ELSE '^\S+' END, '')), '')
WHERE a.first_name IS NULL AND coalesce(trim(a.full_name), '') <> '';
