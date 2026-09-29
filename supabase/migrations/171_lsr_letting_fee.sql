-- Migration 171: LSR letting_fee + statement line item back-reference
--
-- Three additions:
--
--  1. letting_fee column on landlord_statement_rooms
--     Previously letting fees were either lost or merged into management_fee.
--     Now each row carries its own letting_fee so the net figure is correct:
--       net_to_landlord = rent_income - management_fee - letting_fee
--
--  2. other_deductions column — catch-all for property charges attributed
--     to a specific room/tenancy (e.g. cleaning fee on checkout)
--
--  3. lsr_id back-reference on statement_line_items
--     Lets us trace any statement line back to the LSR row it contributed to,
--     completing the audit chain: line_item → lsr_row → rent_charge → bank_txn

ALTER TABLE public.landlord_statement_rooms
  ADD COLUMN IF NOT EXISTS letting_fee       NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions  NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Recomputed formula:
--   net_to_landlord = rent_income - management_fee - letting_fee - other_deductions
-- (Existing rows with other_deductions=0 and letting_fee=0 are unchanged in effect)

ALTER TABLE public.statement_line_items
  ADD COLUMN IF NOT EXISTS landlord_statement_room_id
    UUID REFERENCES public.landlord_statement_rooms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sli_lsr_room
  ON public.statement_line_items(landlord_statement_room_id)
  WHERE landlord_statement_room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lsr_room_stmt
  ON public.landlord_statement_rooms(statement_id, room_id);

NOTIFY pgrst, 'reload schema';
