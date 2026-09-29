-- 196 — HMO licence: "application made, waiting for the council"
-- Councils can take months to issue a licence. Once an application has been duly made the property is covered
-- (Housing Act 2004 s.72(4)(b)), so the licence shouldn't show as an urgent "expired" while we wait.
-- Filling in the new licence's expiry date clears these (the screen does that).
alter table public.properties
  add column if not exists licence_application_submitted_at date,
  add column if not exists licence_application_ref text;

comment on column public.properties.licence_application_submitted_at is 'Date the HMO licence (or renewal) application was made to the council; null = none pending';
comment on column public.properties.licence_application_ref is 'Council''s application reference, if given';

-- Every property must have a postcode (29 Sep 2026). NOT VALID: applies to every new property and every edit from
-- now on, without failing on old demo rows. The screens check it first and explain; this is the backstop.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_postcode_required') then
    alter table public.properties add constraint properties_postcode_required
      check (postcode is not null and btrim(postcode) <> '') not valid;
  end if;
end $$;
