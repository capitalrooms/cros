-- Migration 145: Property Tasks
-- Internal admin-only task list per property.
-- Designed with quoting (feature 6) in mind: ticket_id + quote_request_id
-- columns are nullable FKs that will be used when those features are built.

CREATE TABLE IF NOT EXISTS property_tasks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id           UUID        REFERENCES rooms(id) ON DELETE SET NULL,      -- optional: room-specific task
  description       TEXT        NOT NULL,
  notes             TEXT,
  responsible       TEXT,                                                     -- freeform: "Me", "Ricky", "Landlord" etc.
  due_date          DATE,                                                     -- for reminders + deadlines view
  reminder_sent     BOOLEAN     NOT NULL DEFAULT false,                       -- cron sets true once push is sent
  status            TEXT        NOT NULL DEFAULT 'open'                       -- 'open' | 'completed' | 'converted' | 'archived'
                    CHECK (status IN ('open','completed','converted','archived')),
  completed         BOOLEAN     NOT NULL DEFAULT false,
  completed_at      TIMESTAMPTZ,
  completed_by      UUID        REFERENCES people(id) ON DELETE SET NULL,

  -- Feature 4: converted to a maintenance ticket
  ticket_id         UUID        REFERENCES maintenance_tickets(id) ON DELETE SET NULL,

  -- Feature 6 (future): quote request originated from this task
  -- quote_request_id UUID REFERENCES quote_requests(id) ON DELETE SET NULL,

  created_by        UUID        REFERENCES people(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_property_tasks_property_id ON property_tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_property_tasks_due_date    ON property_tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_tasks_status      ON property_tasks(status);
CREATE INDEX IF NOT EXISTS idx_property_tasks_responsible ON property_tasks(responsible) WHERE responsible IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_property_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_tasks_updated_at ON property_tasks;
CREATE TRIGGER trg_property_tasks_updated_at
  BEFORE UPDATE ON property_tasks
  FOR EACH ROW EXECUTE FUNCTION update_property_tasks_updated_at();

-- RLS: admin-only (read + write)
ALTER TABLE property_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_property_tasks" ON property_tasks;
CREATE POLICY "admin_all_property_tasks"
  ON property_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.email = auth.jwt()->>'email'
        AND people.role IN ('administrator','admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.email = auth.jwt()->>'email'
        AND people.role IN ('administrator','admin')
    )
  );
