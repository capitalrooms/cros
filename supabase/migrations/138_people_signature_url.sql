-- Migration 138: Add signature_url to people table
--
-- Stores the URL of a staff member's scanned/uploaded signature image in
-- Supabase Storage (bucket: inbox-docs, path: staff-signatures/{id}.{ext}).
-- PDF generators download this at generation time and render it in the
-- sign-off block between "Yours sincerely," and the person's printed name.
--
-- NULL = render a blank gap (old behaviour) for unsigned letters.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS signature_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.people.signature_url
  IS 'Storage path (inbox-docs bucket) or public URL for this person''s signature image. Rendered in PDF sign-off blocks.';
