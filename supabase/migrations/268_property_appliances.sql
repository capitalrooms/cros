-- 268 — the appliances in each house (6 Nov 2026, Harry: "take photos of a specific appliance and it will add that to
-- the house … just get manufacturer and model"). Read from a photo of the label (lib/house/snap) — the photo itself is
-- never kept — approved by the office, shown to the
-- tenants in the app, and offered when they report a fault ("by dishwasher do you mean the Bosch SMS2ITW08G?") so the
-- troubleshooting and the job both name the exact model. Only the server reads and writes it (RLS on, no policies).
CREATE TABLE IF NOT EXISTS public.property_appliances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id            uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  kind               text NOT NULL,            -- washing_machine, dishwasher, fridge_freezer, oven, hob, boiler …
  brand              text,
  model              text,
  location           text,                     -- "Kitchen", "Utility cupboard"
  -- when it was bought, so its age is known: matched by the office to an expense or a line on an imported statement
  bought_on          date,
  bought_note        text,                     -- "Currys, £349.00 — EXP000123"
  expense_id         uuid REFERENCES public.recharge_expenses(id) ON DELETE SET NULL,
  statement_line_id  uuid,
  visible_to_tenants boolean NOT NULL DEFAULT true,
  added_by           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  removed_at         timestamptz
);
CREATE INDEX IF NOT EXISTS property_appliances_property ON public.property_appliances (property_id) WHERE removed_at IS NULL;
ALTER TABLE public.property_appliances ENABLE ROW LEVEL SECURITY;
