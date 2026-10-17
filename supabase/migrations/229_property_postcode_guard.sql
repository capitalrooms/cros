-- 229 — A property's postcode always agrees with its address (17 Oct 2026). Harry: "Why the hell is Clement House
-- still got this wrong address … fix it and never have this issue again". 8 Clement House said SE8 5RY in its address
-- (and on its EPC, HMO licence and certificates) but SE16 6DL in its postcode field — the wrong council, and statements
-- matched by postcode could miss it. The edit screen already refused a mismatch, but houses are saved from many
-- screens and imports, so the rule now lives in the database, where nothing can get round it:
--   • the postcode field is tidied to capitals with one space ("se85ry" → "SE8 5RY")
--   • a blank postcode is filled from the postcode written in the address
--   • a postcode that isn't the one written in the address is refused, with a plain message saying which is which
-- Only checked when the address or postcode is being changed (or a house is added), so nothing else is ever blocked.
-- Also tidies the spacing of postcodes already on file. Idempotent: safe to run more than once.

CREATE OR REPLACE FUNCTION public.cros_tidy_postcode(v TEXT) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE m TEXT[];
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN RETURN NULL; END IF;
  m := regexp_match(upper(v), '([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})');
  RETURN CASE WHEN m IS NULL THEN upper(btrim(v)) ELSE m[1] || ' ' || m[2] END;
END $$;

CREATE OR REPLACE FUNCTION public.cros_property_postcode_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  found TEXT[] := ARRAY[]::TEXT[];
  r TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.address IS NOT DISTINCT FROM OLD.address AND NEW.postcode IS NOT DISTINCT FROM OLD.postcode THEN
    RETURN NEW;
  END IF;
  NEW.postcode := public.cros_tidy_postcode(NEW.postcode);
  -- every postcode written in the address (a full one: outward + inward code)
  FOR r IN SELECT regexp_matches(upper(coalesce(NEW.address, '')), '(?:^|[^A-Z0-9])([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})(?![A-Z0-9])', 'g') LOOP
    found := found || (r[1] || ' ' || r[2]);
  END LOOP;
  IF NEW.postcode IS NULL AND array_length(found, 1) > 0 THEN
    NEW.postcode := found[array_length(found, 1)];
  ELSIF NEW.postcode IS NOT NULL AND array_length(found, 1) > 0 AND NOT (NEW.postcode = ANY(found)) THEN
    RAISE EXCEPTION 'The postcode % doesn''t match the address, which says %. Correct whichever is wrong so they agree.', NEW.postcode, found[array_length(found, 1)]
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS properties_postcode_guard ON public.properties;
CREATE TRIGGER properties_postcode_guard BEFORE INSERT OR UPDATE OF address, postcode ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.cros_property_postcode_guard();

-- tidy the spacing of postcodes already on file — only where it agrees with the address (or the address has none),
-- so this can never be refused by the rule above
UPDATE public.properties p
   SET postcode = public.cros_tidy_postcode(p.postcode)
 WHERE p.postcode IS NOT NULL
   AND p.postcode IS DISTINCT FROM public.cros_tidy_postcode(p.postcode)
   AND (upper(regexp_replace(coalesce(p.address, ''), '\s', '', 'g')) LIKE '%' || upper(regexp_replace(p.postcode, '\s', '', 'g')) || '%'
        OR coalesce(p.address, '') !~* '[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}');
