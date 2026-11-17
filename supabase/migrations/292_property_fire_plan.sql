-- 292 — The fire evacuation plan as text on each property (17 Nov 2026, Harry: "in property information we can just write
-- in details … that then drops into a standardised fire evacuation planner which we can print or keep in app"). The
-- printable landscape PDF and the tenants' in-app card are made from it (lib/firePlan); a floor-plan drawing, if any,
-- stays the imported image beside it. Idempotent.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS fire_plan JSONB;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS fire_plan_updated_at TIMESTAMPTZ;
