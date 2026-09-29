-- Migration 166: Capital Rooms reference system
-- Adds human-readable CR reference columns to all financial tables.
-- Format: TYPE-{PROPCODE}-{ROOM}-{SEQ} or TYPE-{PROPCODE}-{YYMM}
-- Examples: T-008CLH-R4-003, RR-008CLH-R4-2609, DEP-008CLH-R4-003
-- lease_reference already exists on tenancies (VARCHAR 50) — repopulated with CR format

ALTER TABLE public.tenancies
  ADD COLUMN IF NOT EXISTS deposit_reference          TEXT,   -- e.g. DEP-008CLH-R4-003 (our internal ref)
  ADD COLUMN IF NOT EXISTS holding_deposit_reference  TEXT;   -- e.g. HD-008CLH-R4-003

ALTER TABLE public.rent_charges
  ADD COLUMN IF NOT EXISTS reference  TEXT;                   -- e.g. RR-008CLH-R4-2609

CREATE UNIQUE INDEX IF NOT EXISTS idx_rent_charges_reference
  ON public.rent_charges(reference) WHERE reference IS NOT NULL;

ALTER TABLE public.recharge_expenses
  ADD COLUMN IF NOT EXISTS reference  TEXT;                   -- e.g. EXP-008CLH-042

ALTER TABLE public.landlord_statements
  ADD COLUMN IF NOT EXISTS reference  TEXT;                   -- e.g. STMT-008CLH-2609

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS reference  TEXT;                   -- e.g. JOB-008CLH-015

CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_tickets_reference
  ON public.maintenance_tickets(reference) WHERE reference IS NOT NULL;

NOTIFY pgrst, 'reload schema';
