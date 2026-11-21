-- A contractor can ask the office to book a visit to a house (to measure or check something before a repair),
-- not only to price work. Same flow as quote requests; the office books it. Not applied yet — run with approval.
ALTER TABLE public.contractor_quote_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'quote' CHECK (kind IN ('quote', 'visit'));
ALTER TABLE public.contractor_quote_requests ADD COLUMN IF NOT EXISTS preferred_days TEXT;
