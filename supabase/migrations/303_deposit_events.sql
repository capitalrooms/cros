-- 303 — deposit events (24 Nov 2026).
-- Every movement of a tenant deposit is one row here, so the trail is complete and nothing is counted twice:
--   received          the deposit was taken (counts once, on the tenancy that took it)
--   protected         it was protected with the scheme (reference kept on the tenancy)
--   transferred_out   it left the old tenancy when the tenant moved room (same money, same DEP number)
--   transferred_in    it arrived on the new tenancy after the move (same money, same DEP number — NOT a new receipt)
--   return_agreed     owed back to the tenant (refund and take again), not yet paid
--   returned          paid back to the tenant (set when the bank refund has gone out)
-- Rows are never edited or deleted (cros_no_delete). A correction is a new row. Staff only; the server writes with the
-- service role. Not yet read by the books or client account — they still count deposits once from the tenancy's own
-- receipt, which the move route no longer creates for a carried-over deposit.

CREATE TABLE IF NOT EXISTS public.deposit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_no      TEXT NOT NULL,                       -- the DEP number the money keeps for its whole life
  kind            TEXT NOT NULL CHECK (kind IN ('received', 'protected', 'transferred_out', 'transferred_in', 'return_agreed', 'returned')),
  amount          NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  event_on        DATE NOT NULL,
  tenancy_id      UUID NOT NULL REFERENCES public.tenancies(id),   -- the tenancy this row sits on
  from_tenancy_id UUID REFERENCES public.tenancies(id),           -- transfers: where it came from
  to_tenancy_id   UUID REFERENCES public.tenancies(id),           -- transfers: where it went
  reference       TEXT,                                 -- scheme reference, bank reference, or the DEPR number
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT
);

CREATE INDEX IF NOT EXISTS deposit_events_no_idx ON public.deposit_events (deposit_no, event_on, created_at);
CREATE INDEX IF NOT EXISTS deposit_events_tenancy_idx ON public.deposit_events (tenancy_id);

-- a transfer has a from and a to; the other kinds have neither required
ALTER TABLE public.deposit_events DROP CONSTRAINT IF EXISTS deposit_events_transfer_sides;
ALTER TABLE public.deposit_events ADD CONSTRAINT deposit_events_transfer_sides CHECK (
  (kind = 'transferred_out' AND to_tenancy_id IS NOT NULL) OR
  (kind = 'transferred_in' AND from_tenancy_id IS NOT NULL) OR
  kind NOT IN ('transferred_out', 'transferred_in')
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'deposit_events_no_delete') THEN
    CREATE TRIGGER deposit_events_no_delete BEFORE DELETE ON public.deposit_events
      FOR EACH ROW EXECUTE FUNCTION public.cros_no_delete();
  END IF;
END $$;

ALTER TABLE public.deposit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads and writes deposit events" ON public.deposit_events;
CREATE POLICY "office reads and writes deposit events" ON public.deposit_events
  FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
