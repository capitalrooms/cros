-- Add Persistent Notifications System
-- Stores all user notifications (emails, property updates, viewing schedules, etc.)

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  related_table VARCHAR(100),
  related_id UUID,
  action_url VARCHAR(500),
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON public.notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;

-- 3. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. Create trigger for updated_at
DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Create RLS policies
-- Users can only read their own notifications
CREATE POLICY "users_can_read_own_notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- Authenticated users can create notifications (via app/API)
CREATE POLICY "authenticated_can_insert_notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Users can update their own notifications (mark as read/dismissed)
CREATE POLICY "users_can_update_own_notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- 6. Add notification_type constraint
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'viewing_scheduled',
  'viewing_cancelled',
  'property_update',
  'maintenance_reported',
  'maintenance_scheduled',
  'maintenance_completed',
  'contractor_assigned',
  'cleaner_assigned',
  'admin_appointment',
  'payment_due',
  'document_shared',
  'general'
));
