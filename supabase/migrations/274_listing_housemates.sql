-- 274 — how many people live in the house now, as the advert says it (9 Nov 2026, Harry: a SpareRoom import said
-- 4 bedrooms / 3 flatmates and CROS said 2 rooms / 0 flatmates — CROS only holds the rooms we let, so its count from
-- tenancies is wrong for those houses). Blank = worked out from CROS's tenancies, as before.
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS housemates integer CHECK (housemates IS NULL OR housemates BETWEEN 0 AND 30);
