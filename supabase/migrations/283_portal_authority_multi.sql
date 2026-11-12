-- 283 (12 Nov 2026, Harry: "it should be found in the actual landlord info as that holds their docs … must be able to
-- assign to certain property of choice if they have multiple, or all"). One request can now cover several of a
-- landlord's properties: one letter of authority listing them all, photo ID once, and proof of ownership for each
-- property (ownership: { "<property id>": { "type": "land_registry", "path": "…" } }). property_id stays as the first
-- property, so older single-property requests read as before.
ALTER TABLE public.portal_authority_requests ADD COLUMN IF NOT EXISTS property_ids uuid[];
ALTER TABLE public.portal_authority_requests ADD COLUMN IF NOT EXISTS ownership jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.portal_authority_requests SET property_ids = ARRAY[property_id] WHERE property_ids IS NULL;
CREATE INDEX IF NOT EXISTS portal_authority_landlord_idx ON public.portal_authority_requests (landlord_id, created_at DESC);
-- documents CROS already holds (photo ID / proof of ownership from onboarding or the property's files) that the
-- office chose to use, so the landlord isn't asked again: { id: {label,path|url}, ownership: { <property id>: {…} } }
ALTER TABLE public.portal_authority_requests ADD COLUMN IF NOT EXISTS on_file jsonb NOT NULL DEFAULT '{}'::jsonb;
