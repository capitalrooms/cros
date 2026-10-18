-- 232 — Practice initial monies (18 Oct 2026). A let-only practice let's tenant-find fee transfer (office_transfers)
-- has no house or payment run of its own — it belongs to an initial monies record (migration 231). Without this it
-- would take a real TRF number. Now: a row that belongs to a demo house's initial monies is practice too (XTRF…).
-- Idempotent: safe to run more than once.
CREATE OR REPLACE FUNCTION public.cros_is_practice(j JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (j->>'is_practice') = 'true' THEN RETURN TRUE; END IF;
  IF j ? 'property_id' AND NULLIF(j->>'property_id', '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.properties WHERE id = (j->>'property_id')::UUID AND is_demo) THEN RETURN TRUE; END IF;
  IF j ? 'payment_run_id' AND NULLIF(j->>'payment_run_id', '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.payment_runs WHERE id = (j->>'payment_run_id')::UUID AND is_practice) THEN RETURN TRUE; END IF;
  IF j ? 'initial_monies_id' AND NULLIF(j->>'initial_monies_id', '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.initial_monies im JOIN public.properties p ON p.id = im.property_id
                 WHERE im.id = (j->>'initial_monies_id')::UUID AND p.is_demo) THEN RETURN TRUE; END IF;
  RETURN FALSE;
END $$;
REVOKE ALL ON FUNCTION public.cros_is_practice(JSONB) FROM PUBLIC, anon, authenticated;
