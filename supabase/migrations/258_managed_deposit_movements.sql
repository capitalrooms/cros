-- 258: a managed tenancy's deposit through the client account (Harry, 3 Nov 2026: "We receive deposit and then either
-- send to landlord for let onlys or send to the DPS for securing. These are the only options"). Let-only deposits go
-- to the landlord inside the initial monies (migration 231); these columns are for the deposit we send to the DPS.
-- Received → it's in the client account, owed to the DPS; sent → gone. Never deleted: a mistake is corrected with a
-- reason (kept in the tenancy's activity). ADDITIVE, idempotent: safe to run more than once.
ALTER TABLE public.tenancies
  ADD COLUMN IF NOT EXISTS deposit_received_on     date,
  ADD COLUMN IF NOT EXISTS deposit_received_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS deposit_sent_on         date,
  ADD COLUMN IF NOT EXISTS deposit_sent_amount     numeric(10,2),
  ADD COLUMN IF NOT EXISTS deposit_sent_reference  text;
