-- 257: who holds the deposit is set when a tenancy is made (Harry, 3 Nov 2026) — let-only (house or room) → the
-- landlord; managed → the agent unless the setup chose otherwise. Applies to every way a tenancy is created.
-- Existing tenancies are filled in from Finance › Health check (through CROS), not here.
-- ADDITIVE, idempotent: safe to run more than once.
CREATE OR REPLACE FUNCTION public.tenancy_deposit_holder() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE let_only boolean;
BEGIN
  SELECT (p.letting_type = 'let_only') OR COALESCE(r.is_let_only, false) INTO let_only
    FROM public.properties p LEFT JOIN public.rooms r ON r.id = NEW.room_id
   WHERE p.id = NEW.property_id;
  IF COALESCE(let_only, false) THEN
    NEW.deposit_held_by := 'landlord';
  ELSIF NEW.deposit_held_by IS NULL THEN
    NEW.deposit_held_by := 'agent';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenancy_deposit_holder ON public.tenancies;
CREATE TRIGGER tenancy_deposit_holder BEFORE INSERT ON public.tenancies
  FOR EACH ROW EXECUTE FUNCTION public.tenancy_deposit_holder();

