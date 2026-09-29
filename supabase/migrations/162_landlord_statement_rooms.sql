-- 144: landlord_statement_rooms
-- Proper normalised per-room rent table for landlord statements.
-- Migration 041 defined this table but was never applied to production.
-- This supersedes it: room_id is nullable (so partial matches can be
-- saved with needs_review=true rather than failing the whole import).

CREATE TABLE IF NOT EXISTS public.landlord_statement_rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id    UUID NOT NULL REFERENCES public.landlord_statements(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Resolved FKs — populated when the room/tenancy can be matched
  room_id         UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  tenant_id       UUID REFERENCES public.people(id) ON DELETE SET NULL,
  tenancy_id      UUID REFERENCES public.tenancies(id) ON DELETE SET NULL,

  -- Raw extracted values (always populated)
  room_number     INTEGER,           -- as read from the statement (1, 2, 3…)
  tenant_name     TEXT NOT NULL,     -- verbatim from statement

  -- Financials
  rent_income     NUMERIC(10,2) NOT NULL,
  management_fee  NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_to_landlord NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Review flag — true when room_id/tenant_id could not be resolved at import
  needs_review    BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lsr_statement  ON public.landlord_statement_rooms(statement_id);
CREATE INDEX IF NOT EXISTS idx_lsr_property   ON public.landlord_statement_rooms(property_id);
CREATE INDEX IF NOT EXISTS idx_lsr_tenant     ON public.landlord_statement_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lsr_tenancy    ON public.landlord_statement_rooms(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_lsr_review     ON public.landlord_statement_rooms(needs_review) WHERE needs_review = true;

ALTER TABLE public.landlord_statement_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landlords_read_own_lsr" ON public.landlord_statement_rooms;
CREATE POLICY "landlords_read_own_lsr" ON public.landlord_statement_rooms
  FOR SELECT USING (
    property_id IN (
      SELECT ls.property_id FROM public.landlord_statements ls
      WHERE ls.landlord_id IN (
        SELECT id FROM public.people WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

DROP POLICY IF EXISTS "admins_manage_lsr" ON public.landlord_statement_rooms;
CREATE POLICY "admins_manage_lsr" ON public.landlord_statement_rooms
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE email = (auth.jwt() ->> 'email')
        AND role IN ('administrator', 'admin', 'lettings')
    )
  );
