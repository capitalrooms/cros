-- 209 — Practice mode: run the whole monthly cycle on a demo house (properties.is_demo) for real, without touching
-- the real books. Rent charges, receipts, expenses, statements, fees, landlord payments and transfers made for a demo
-- house — or in a practice payment run — get practice numbers: X + the usual code (XRENT000001, XEXP…, XMGMT…, XPAY…,
-- XRUN…, XTRF…, statements XLS0001), from their own sequences. The real number series never move, so they keep no gaps.
-- payment_runs.is_practice keeps practice runs apart from real ones (the code shows each only in its own mode).
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

ALTER TABLE public.payment_runs ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT FALSE;

-- Is this row practice? A demo house's row, a practice run, or a row of a practice run.
CREATE OR REPLACE FUNCTION public.cros_is_practice(j JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (j->>'is_practice') = 'true' THEN RETURN TRUE; END IF;
  IF j ? 'property_id' AND NULLIF(j->>'property_id', '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.properties WHERE id = (j->>'property_id')::UUID AND is_demo) THEN RETURN TRUE; END IF;
  IF j ? 'payment_run_id' AND NULLIF(j->>'payment_run_id', '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.payment_runs WHERE id = (j->>'payment_run_id')::UUID AND is_practice) THEN RETURN TRUE; END IF;
  RETURN FALSE;
END $$;
REVOKE ALL ON FUNCTION public.cros_is_practice(JSONB) FROM PUBLIC, anon, authenticated;

-- The numbering trigger (migration 191), now practice-aware: practice rows draw from X-prefixed sequences.
CREATE OR REPLACE FUNCTION public.cros_assign_finance_no() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE col TEXT := TG_ARGV[0]; v_code TEXT := TG_ARGV[1]; amt TEXT := NULLIF(TG_ARGV[2], '-'); j JSONB := to_jsonb(NEW);
BEGIN
  IF j->>col IS NULL AND (amt IS NULL OR COALESCE(NULLIF(j->>amt, '')::NUMERIC, 0) > 0) THEN
    IF public.cros_is_practice(j) THEN
      v_code := 'X' || v_code;
      INSERT INTO public.finance_sequences AS fs (code, label) VALUES (v_code, 'Practice ' || TG_ARGV[1]) ON CONFLICT ON CONSTRAINT finance_sequences_pkey DO NOTHING;
    END IF;
    NEW := jsonb_populate_record(NEW, jsonb_build_object(col, public.next_finance_no(v_code)));
  END IF;
  RETURN NEW;
END $$;

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
    SELECT 'XLS' || lpad((COALESCE(max(substring(statement_reference FROM 4)::INT), 0) + 1)::TEXT, 4, '0') INTO ref
      FROM public.landlord_statements WHERE statement_reference ~ '^XLS[0-9]+$';
  ELSE
    SELECT 'LS' || lpad((COALESCE(max(substring(statement_reference FROM 3)::INT), 0) + 1)::TEXT, 4, '0') INTO ref
      FROM public.landlord_statements WHERE statement_reference ~ '^LS[0-9]+$';
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
REVOKE ALL ON FUNCTION public.cros_create_statement(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cros_create_statement(JSONB) TO service_role;
