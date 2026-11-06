-- 266 — a fifth kind of landlord update: "Meet your new housemate" (6 Nov 2026). A card about the incoming tenant —
-- only what they chose to share in their move-in pack (photo, a few talking points; never contact or money details) —
-- for the landlord to forward to the other tenants in the house (lib/landlordUpdates, lib/housemates/profile).
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.landlord_updates'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%stage%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.landlord_updates DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.landlord_updates ADD CONSTRAINT landlord_updates_stage_check
  CHECK (stage IN ('offer', 'reserved', 'referenced', 'signed_paid', 'summary', 'housemate'));
