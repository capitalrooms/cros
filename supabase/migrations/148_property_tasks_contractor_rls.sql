-- 148: Allow contractors to read and complete property_tasks linked to their jobs
-- Previously property_tasks had admin-only RLS (migration 145).
-- Contractors need to read tasks linked to tickets assigned to them,
-- and update status/completed_at when ticking off each task.

-- SELECT: contractor can read tasks where the linked ticket is assigned to them
CREATE POLICY "contractor_read_own_tasks" ON property_tasks
  FOR SELECT
  USING (
    ticket_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM maintenance_tickets mt
      JOIN people p ON p.email = (auth.jwt() ->> 'email')
      WHERE mt.id = property_tasks.ticket_id
        AND mt.contractor_id = p.id
    )
  );

-- UPDATE: contractor can update status and completed_at on their tasks
CREATE POLICY "contractor_update_own_tasks" ON property_tasks
  FOR UPDATE
  USING (
    ticket_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM maintenance_tickets mt
      JOIN people p ON p.email = (auth.jwt() ->> 'email')
      WHERE mt.id = property_tasks.ticket_id
        AND mt.contractor_id = p.id
    )
  )
  WITH CHECK (
    ticket_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM maintenance_tickets mt
      JOIN people p ON p.email = (auth.jwt() ->> 'email')
      WHERE mt.id = property_tasks.ticket_id
        AND mt.contractor_id = p.id
    )
  );
