-- Migration 076: purchases / assets bought for a property or a specific room.
--
-- Every purchase belongs to a property (property_id) and MAY belong to a
-- specific room (room_id NULL = property/communal level). Supports viewing all
-- purchases for a property, or drilling into a single room's items.
-- Categories: appliance, furniture, furnishings, building_material, other.
-- source_document_id optionally links to an uploaded invoice/receipt.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,  -- NULL = whole property
  category VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (category IN ('appliance','furniture','furnishings','building_material','other')),
  name VARCHAR(255),
  make_model VARCHAR(255),
  purchased_date DATE,
  purchased_by VARCHAR(255),
  cost NUMERIC(10, 2),
  notes TEXT,
  source_document_id UUID,       -- optional link to an uploaded invoice/receipt
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for the two primary views: whole-property, and per-room drill-in.
CREATE INDEX IF NOT EXISTS idx_purchases_property_id ON public.purchases(property_id);
CREATE INDEX IF NOT EXISTS idx_purchases_room_id ON public.purchases(room_id);
CREATE INDEX IF NOT EXISTS idx_purchases_category ON public.purchases(category);

-- updated_at trigger (function exists from earlier migrations)
DROP TRIGGER IF EXISTS update_purchases_updated_at ON public.purchases;
CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: admins/landlords manage; auth mapping is people.email = auth.jwt()->>'email'.
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchases_admin_all ON public.purchases;
CREATE POLICY purchases_admin_all ON public.purchases
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin')
  )
  WITH CHECK (
    (SELECT role FROM public.people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin')
  );
