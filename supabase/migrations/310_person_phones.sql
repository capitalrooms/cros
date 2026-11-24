-- 310 — more than one phone number per person; a new number is confirmed by a text code and then becomes the
-- preferred one, which is the number the office shares or calls (24 Nov 2026).
CREATE TABLE IF NOT EXISTS public.person_phones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     UUID NOT NULL REFERENCES public.people(id),
  phone         TEXT NOT NULL,                 -- E.164, e.g. +447700900000
  preferred     BOOLEAN NOT NULL DEFAULT false,
  confirmed_at  TIMESTAMPTZ,
  code_hash     TEXT,
  code_expires  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (person_id, phone)
);
-- one preferred number per person
CREATE UNIQUE INDEX IF NOT EXISTS person_phones_one_preferred ON public.person_phones (person_id) WHERE preferred;
ALTER TABLE public.person_phones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads person phones" ON public.person_phones;
CREATE POLICY "office reads person phones" ON public.person_phones FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
