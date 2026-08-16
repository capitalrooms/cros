-- Audit Logging Table
-- Track all user actions for security monitoring and compliance

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.people(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL, -- 'create', 'read', 'update', 'delete', 'login', 'logout'
  table_name VARCHAR(100), -- 'maintenance_tickets', 'viewings', etc.
  record_id VARCHAR(255), -- ID of record affected
  details TEXT, -- JSON or text details of what changed
  ip_address INET, -- Client IP address
  user_agent TEXT, -- Browser/client info
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record
  ON public.audit_logs(table_name, record_id);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "admin_only_read_audit_logs" ON public.audit_logs
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

-- Only system (service role) can insert
-- Note: This is typically called from API endpoints with service role key
-- In practice, you'd insert via a trigger or API endpoint with proper auth
CREATE POLICY "system_insert_audit_logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);  -- Restricted at API level instead
