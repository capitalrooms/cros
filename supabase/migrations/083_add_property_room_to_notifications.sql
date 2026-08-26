-- Migration 083: give notifications a property_id + room_id so the Communications
-- Hub can filter/drill-down by property → room. No FKs (consistent with the rest
-- of this schema's soft relationships), nullable so existing rows are unaffected.
-- Idempotent.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS property_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS room_id UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_property ON public.notifications(property_id);

NOTIFY pgrst, 'reload schema';
