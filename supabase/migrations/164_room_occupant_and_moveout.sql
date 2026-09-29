-- Migration 164: Let-only room occupant contact + move-out date
-- Stores lightweight contact info for let-only tenants not managed in CROS.
-- Used to SMS the current occupant when a viewing is booked in their room.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS occupant_name  TEXT,
  ADD COLUMN IF NOT EXISTS occupant_phone TEXT,
  ADD COLUMN IF NOT EXISTS move_out_date  DATE;

COMMENT ON COLUMN public.rooms.occupant_name  IS 'Current occupant name — for let-only rooms where tenant is not a CROS person';
COMMENT ON COLUMN public.rooms.occupant_phone IS 'Mobile for SMS viewing notice — let-only occupants only';
COMMENT ON COLUMN public.rooms.move_out_date  IS 'Date current occupant is leaving — drives available-soon status in lettings';

NOTIFY pgrst, 'reload schema';
