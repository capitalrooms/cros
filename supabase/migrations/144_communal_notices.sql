-- Migration 144: Communal Notice Board
-- Shared notice board per property: Info notices and Task notices with resolution workflow

CREATE TABLE IF NOT EXISTS communal_notices (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_by    UUID        NOT NULL REFERENCES people(id),
  notice_type   TEXT        NOT NULL CHECK (notice_type IN ('info', 'task')),
  subtype       TEXT,
  raw_text      TEXT        NOT NULL,
  ai_text       TEXT,
  photo_url     TEXT,
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  resolved_by   UUID        REFERENCES people(id),
  resolved_at   TIMESTAMPTZ,
  resolved_photo_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communal_notices_property_created
  ON communal_notices(property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communal_notices_property_status
  ON communal_notices(property_id, status, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE communal_notices ENABLE ROW LEVEL SECURITY;

-- Helper: is caller a tenant at this property?
-- (also used by insert check)
CREATE OR REPLACE FUNCTION is_tenant_at_property(prop_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   people pe
    JOIN   tenancies t  ON t.person_id = pe.id
    JOIN   rooms r      ON r.id = t.room_id
    WHERE  pe.email = auth.jwt()->>'email'
      AND  r.property_id = prop_id
      AND  (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)
  )
$$;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM people
    WHERE  email = auth.jwt()->>'email'
      AND  role IN ('administrator','lettings','staff')
  )
$$;

-- SELECT: tenants at property OR staff
CREATE POLICY "notices_select" ON communal_notices
  FOR SELECT USING (
    is_tenant_at_property(property_id) OR is_staff()
  );

-- INSERT: tenants at property OR staff
CREATE POLICY "notices_insert" ON communal_notices
  FOR INSERT WITH CHECK (
    is_tenant_at_property(property_id) OR is_staff()
  );

-- UPDATE: tenants at property OR staff (resolve flow)
CREATE POLICY "notices_update" ON communal_notices
  FOR UPDATE USING (
    is_tenant_at_property(property_id) OR is_staff()
  );

-- DELETE: staff only (admin cleanup)
CREATE POLICY "notices_delete" ON communal_notices
  FOR DELETE USING (is_staff());
