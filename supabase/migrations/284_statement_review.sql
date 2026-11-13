-- 284 — Statements in: every statement that arrives (statements@ email or upload) waits to be checked against its PDF
-- (13 Nov 2026, Harry: "it just gets swallowed up … it should let you go through each property and agree if that's
-- what happened for that property in that month via the statement pdf").
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'to_review';   -- to_review | agreed
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS pdf_path text;              -- the statement PDF as received (bucket "statements")
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS received_via text;          -- email | upload | hand
ALTER TABLE public.landlord_statements ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid; -- another statement for the same property and month

-- statements already in CROS before this: the older ones count as checked; anything from the last fortnight
-- (this month's batch) waits for review
UPDATE public.landlord_statements SET review_status = 'agreed', reviewed_at = now(), reviewed_by = 'before review existed'
  WHERE created_at < now() - interval '14 days' AND review_status = 'to_review';

-- the same property and month twice already on file → flagged against each other
UPDATE public.landlord_statements a SET possible_duplicate_of = b.id
  FROM public.landlord_statements b
  WHERE a.property_id = b.property_id AND a.id <> b.id AND a.possible_duplicate_of IS NULL
    AND date_trunc('month', a.statement_date) = date_trunc('month', b.statement_date)
    AND a.created_at >= now() - interval '14 days' AND b.created_at <= a.created_at;

CREATE INDEX IF NOT EXISTS landlord_statements_review_idx ON public.landlord_statements (review_status, created_at DESC);

INSERT INTO storage.buckets (id, name, public) VALUES ('statements', 'statements', false) ON CONFLICT (id) DO NOTHING;
