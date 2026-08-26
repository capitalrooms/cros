-- Migration 081: let tenants actually read their own notifications.
--
-- notifications.user_id holds a people.id, but the original policies checked
-- `user_id = auth.uid()` — and auth.uid() is the auth user id, which is NOT
-- equal to people.id in this project (auth maps by email). So the check never
-- matched and tenants could never see anything sent to them. Match by email,
-- the same way every other tenant-facing policy here does.
-- Idempotent.

DROP POLICY IF EXISTS users_can_read_own_notifications ON public.notifications;
DROP POLICY IF EXISTS notifications_read_own ON public.notifications;
CREATE POLICY notifications_read_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT id FROM public.people WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS users_can_update_own_notifications ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT id FROM public.people WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (user_id = (SELECT id FROM public.people WHERE email = auth.jwt() ->> 'email'));

-- (The service-role INSERT policy from migration 016 stays as-is — routes write
-- via the service key.)

NOTIFY pgrst, 'reload schema';
