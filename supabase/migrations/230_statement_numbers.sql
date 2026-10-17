-- 230 — Statement numbers carry on from the old system and can never repeat (17 Oct 2026, finance audit).
-- CROS's next statement number looked only at plain references ("LS0963"); the statements imported for the import
-- period are stored with their month ("LS1066 · Oct 2026"), so the first statement CROS made in November would have
-- been LS0964 — a number 24 Spurgeon Road's May statement already has. Now:
--   • the next number follows the highest LS number on file, whatever comes after it (→ LS1067)
--   • a database rule refuses two statements with the same LS (or practice XLS) number, from any screen or import
-- The function is migration 209's, unchanged apart from the numbering. Idempotent: safe to run more than once.

-- Making a statement: as migration 195, with practice statements numbered XLS
CREATE OR REPLACE FUNCTION public.cros_create_statement(p JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prop        UUID := (p->>'property_id')::UUID;
  gross       NUMERIC := round((p->>'gross_rent')::NUMERIC, 2);
  mgmt        NUMERIC := round((p->>'management_fees')::NUMERIC, 2);
  letf        NUMERIC := round(COALESCE((p->>'letting_fees')::NUMERIC, 0), 2);
  exps        NUMERIC := round((p->>'property_charges')::NUMERIC, 2);
  net         NUMERIC := round((p->>'net_to_landlord')::NUMERIC, 2);
  fret        NUMERIC := round(COALESCE((p->>'float_retained')::NUMERIC, 0), 2);
  fuse        NUMERIC := round(COALESCE((p->>'float_used')::NUMERIC, 0), 2);
  c           JSONB;
  ch          RECORD;
  rent_total  NUMERIC := 0;
  exp_total   NUMERIC := 0;
  let_total   NUMERIC := 0;
  n_exp       INT;
  ref         TEXT;
  new_id      UUID;
BEGIN
  IF prop IS NULL THEN RAISE EXCEPTION 'No property given'; END IF;
  IF fret < 0 OR fuse < 0 OR (fret > 0 AND fuse > 0) THEN RAISE EXCEPTION 'A statement either adds to the float or uses it, not both'; END IF;
  IF net < 0 THEN RAISE EXCEPTION 'The statement would leave the landlord owing money'; END IF;
  IF round(gross + fuse - mgmt - letf - exps - fret - net, 2) <> 0 THEN
    RAISE EXCEPTION 'The statement doesn''t balance: rent £% + float used £% less fees £% and £%, expenses £% and float kept £% is not £%', gross, fuse, mgmt, letf, exps, fret, net;
  END IF;
  IF (SELECT round(COALESCE(sum((r->>'rent_income')::NUMERIC), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> gross
     OR (SELECT round(COALESCE(sum((r->>'management_fee')::NUMERIC), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> mgmt
     OR (SELECT round(COALESCE(sum(COALESCE((r->>'letting_fee')::NUMERIC, 0)), 0), 2) FROM jsonb_array_elements(COALESCE(p->'rooms', '[]')) r) <> letf THEN
    RAISE EXCEPTION 'The room lines don''t add up to the statement totals';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cros_float_' || prop::TEXT));
  IF fuse > public.cros_float_balance(prop) THEN RAISE EXCEPTION 'Only £% is in the float', public.cros_float_balance(prop); END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p->'charges', '[]')) LOOP
    SELECT id, property_id, amount_received, COALESCE(remitted_amount, 0) AS remitted, voided INTO ch
      FROM public.rent_charges WHERE id = (c->>'id')::UUID FOR UPDATE;
    IF ch.id IS NULL OR ch.property_id <> prop OR ch.voided THEN RAISE EXCEPTION 'A rent charge on this statement isn''t for this property'; END IF;
    IF round(ch.amount_received, 2) <> round((c->>'remit_to')::NUMERIC, 2) THEN
      RAISE EXCEPTION 'Rent has changed since this statement was prepared — prepare it again';
    END IF;
    IF ch.remitted >= round((c->>'remit_to')::NUMERIC, 2) THEN RAISE EXCEPTION 'Some of this rent is already on another statement — prepare it again'; END IF;
    rent_total := rent_total + round((c->>'remit_to')::NUMERIC, 2) - ch.remitted;
  END LOOP;
  IF round(rent_total, 2) <> gross THEN
    RAISE EXCEPTION 'Rent on the statement (£%) doesn''t match the rent received and not yet paid over (£%)', gross, round(rent_total, 2);
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0) INTO n_exp, exp_total FROM public.recharge_expenses
   WHERE id IN (SELECT (e->>'id')::UUID FROM jsonb_array_elements(COALESCE(p->'expenses', '[]')) e)
     AND property_id = prop AND included_in_statement_id IS NULL AND voided_at IS NULL;
  IF n_exp <> jsonb_array_length(COALESCE(p->'expenses', '[]')) OR round(exp_total, 2) <> exps THEN
    RAISE EXCEPTION 'An expense has changed or is already on a statement — prepare it again';
  END IF;

  SELECT COALESCE(sum(letting_fee_charged), 0) INTO let_total FROM public.tenancies
   WHERE id IN (SELECT (x #>> '{}')::UUID FROM jsonb_array_elements(COALESCE(p->'letting_fee_tenancies', '[]')) x)
     AND property_id = prop AND letting_fee_statement_id IS NULL;
  IF round(let_total, 2) <> letf THEN RAISE EXCEPTION 'A letting fee has changed or is already charged — prepare it again'; END IF;

  -- the next LS number (one at a time); a practice (demo) house has its own XLS series, never touching the real one
  PERFORM pg_advisory_xact_lock(hashtext('cros_ls_number'));
  IF EXISTS (SELECT 1 FROM public.properties WHERE id = prop AND is_demo) THEN
    SELECT 'XLS' || lpad((COALESCE(max((substring(statement_reference FROM '^XLS([0-9]+)'))::INT), 0) + 1)::TEXT, 4, '0') INTO ref
      FROM public.landlord_statements WHERE statement_reference ~ '^XLS[0-9]+';
  ELSE
    -- carry on from the highest LS number on file, imported ones included ("LS1066 · Oct 2026") — it used to look only
    -- at plain "LS0963"-style numbers, so CROS's first statement would have reused LS0964 (17 Oct 2026)
    SELECT 'LS' || lpad((COALESCE(max((substring(statement_reference FROM '^LS([0-9]+)'))::INT), 0) + 1)::TEXT, 4, '0') INTO ref
      FROM public.landlord_statements WHERE statement_reference ~ '^LS[0-9]+';
  END IF;

  INSERT INTO public.landlord_statements (landlord_id, property_id, statement_reference, reference, statement_date, period_start, period_end,
      gross_rent, management_fees, letting_fees, property_charges, net_to_landlord, float_retained, float_used, management_fee_pct, rooms, expenses, source, created_by)
  VALUES ((p->>'landlord_id')::UUID, prop, ref, ref, (p->>'statement_date')::DATE, (p->>'period_start')::DATE, (p->>'period_end')::DATE,
      gross, mgmt, letf, exps, net, fret, fuse, NULLIF(p->>'management_fee_pct', '')::NUMERIC, COALESCE(p->'rooms', '[]'), COALESCE(p->'expenses', '[]'),
      'cros', NULLIF(p->>'created_by', '')::UUID)
  RETURNING id INTO new_id;

  UPDATE public.rent_charges rc SET remitted_amount = round((x.v->>'remit_to')::NUMERIC, 2), remitted_statement_id = new_id
    FROM jsonb_array_elements(COALESCE(p->'charges', '[]')) AS x(v) WHERE rc.id = (x.v->>'id')::UUID;
  UPDATE public.recharge_expenses SET included_in_statement_id = new_id
   WHERE id IN (SELECT (e->>'id')::UUID FROM jsonb_array_elements(COALESCE(p->'expenses', '[]')) e);
  UPDATE public.tenancies SET letting_fee_statement_id = new_id
   WHERE id IN (SELECT (x #>> '{}')::UUID FROM jsonb_array_elements(COALESCE(p->'letting_fee_tenancies', '[]')) x);

  RETURN jsonb_build_object('id', new_id, 'statement_reference', ref);
END $$;

-- one statement per number: the LS / XLS number at the start of the reference is unique across every statement
CREATE UNIQUE INDEX IF NOT EXISTS landlord_statements_number_unique
  ON public.landlord_statements ((substring(statement_reference FROM '^X?LS[0-9]+')))
  WHERE statement_reference ~ '^X?LS[0-9]+';

REVOKE ALL ON FUNCTION public.cros_create_statement(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cros_create_statement(JSONB) TO service_role;
