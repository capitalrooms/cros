-- Migration 160: Payment reference + letting fee tracking on tenancies
-- payment_reference: unique ref per tenancy (property base ref + room suffix)
-- holding_deposit_received: amount received before full move-in
-- letting_fee_charged: actual fee charged to this landlord (overrides property default)

ALTER TABLE public.tenancies
  ADD COLUMN IF NOT EXISTS payment_reference        TEXT,         -- e.g. "008ROC-R1"
  ADD COLUMN IF NOT EXISTS holding_deposit_received NUMERIC(10,2),-- amount received pre move-in
  ADD COLUMN IF NOT EXISTS letting_fee_charged      NUMERIC(10,2);-- actual fee charged (null = use property default)

COMMENT ON COLUMN public.tenancies.payment_reference        IS 'Unique payment ref for this tenancy — property base ref + room suffix; used in bank transfers and tenancy agreements';
COMMENT ON COLUMN public.tenancies.holding_deposit_received IS 'Holding deposit already received from tenant before move-in; deducted from balance due';
COMMENT ON COLUMN public.tenancies.letting_fee_charged      IS 'Override letting fee for this specific tenancy; null = use property letting_fee_pct/flat';

NOTIFY pgrst, 'reload schema';
