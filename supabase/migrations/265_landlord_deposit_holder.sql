-- 265 — who holds this landlord's tenancy deposits (6 Nov 2026, Harry: "should be in landlord details so if landlord
-- receives deposit then they don't get that"). 'landlord' = the deposit is paid on to them and they protect it
-- (Nigel Spalding); 'agent' = Capital Rooms holds and protects it. Blank = the usual rule (let only → landlord,
-- managed → us). New tenancies take it as deposit_held_by; the landlord's emails word the deposit to match.
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS deposit_held_by_default text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_deposit_held_by_default_check') THEN
    ALTER TABLE public.people ADD CONSTRAINT people_deposit_held_by_default_check CHECK (deposit_held_by_default IS NULL OR deposit_held_by_default IN ('landlord', 'agent'));
  END IF;
END $$;
