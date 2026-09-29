-- Migration 167: Reconciliation — link statement room lines to rent charges
-- Adds confirmation workflow to landlord_statement_rooms so admin can
-- review auto-matched rows before they update rent_charges.

ALTER TABLE public.landlord_statement_rooms
  ADD COLUMN IF NOT EXISTS rent_charge_id  UUID REFERENCES public.rent_charges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by    UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_note  TEXT;

CREATE INDEX IF NOT EXISTS idx_lsr_rent_charge ON public.landlord_statement_rooms(rent_charge_id) WHERE rent_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lsr_confirmed   ON public.landlord_statement_rooms(confirmed) WHERE confirmed = false;
CREATE INDEX IF NOT EXISTS idx_lsr_rejected    ON public.landlord_statement_rooms(rejected)  WHERE rejected  = true;

NOTIFY pgrst, 'reload schema';
