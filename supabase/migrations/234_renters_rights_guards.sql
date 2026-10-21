-- 234 — Renters' Rights Act guards (21 Oct 2026). Harry: "make sure the whole system reflects renters rights".
-- Every tenancy is an assured periodic tenancy: no fixed term, no break clause, and a tenant can't be asked for more
-- than one month's rent in advance. The screens no longer offer any of these; this makes the database refuse them too,
-- whatever screen or import tries. All 64 tenancies on file already comply (checked read-only first).
-- NOT VALID: checks every new or changed row; old rows are left as they are. Idempotent: safe to run more than once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenancies_one_month_in_advance') THEN
    ALTER TABLE public.tenancies ADD CONSTRAINT tenancies_one_month_in_advance CHECK (rent_in_advance IS NULL OR rent_in_advance <= 1) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenancies_no_break_clause') THEN
    ALTER TABLE public.tenancies ADD CONSTRAINT tenancies_no_break_clause CHECK (break_clause_months IS NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenancies_no_new_fixed_terms') THEN
    ALTER TABLE public.tenancies ADD CONSTRAINT tenancies_no_new_fixed_terms CHECK (agreement_type IS DISTINCT FROM 'fixed_term' AND is_fixed_term IS NOT TRUE) NOT VALID;
  END IF;
END $$;
