-- 204 — Capture inbox: photos and paperwork from the office's phones, filed in a couple of taps.
-- Anything photographed or shared (camera roll, the iPhone "Send to CROS" shortcut) lands here first; a quick look
-- suggests what it is and which property, the office confirms, and it's filed: room / property photos, letters and
-- post, bills (optionally as an expense), certificates (via the AI Doc Scanner), handwritten smoke-alarm / fire-door
-- sheets (each line becomes a check, the photo kept as proof), or company post that isn't about a property.

CREATE TABLE IF NOT EXISTS public.capture_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by   UUID REFERENCES public.people(id) ON DELETE SET NULL,
  source        TEXT NOT NULL DEFAULT 'phone' CHECK (source IN ('phone', 'shortcut', 'desktop')),
  file_path     TEXT NOT NULL,                       -- in the private 'capture' bucket
  file_name     TEXT NOT NULL DEFAULT '',
  mime          TEXT,
  size_bytes    BIGINT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'filed', 'discarded')),
  guess         JSONB,                               -- the quick look: { kind, propertyId, roomName, title, confidence, reason }
  kind          TEXT,                                -- what it was filed as
  property_id   UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id       UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  filed_to      TEXT,                                -- where it went, e.g. 'property_photos:<id>'
  filed_at      TIMESTAMPTZ,
  filed_by      UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS capture_items_new_idx ON public.capture_items (created_at DESC) WHERE status = 'new';

-- Personal keys for the iPhone shortcut (only a hash is kept; the key is shown once)
CREATE TABLE IF NOT EXISTS public.capture_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,
  label         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

-- Company post and paperwork that isn't about one property
CREATE TABLE IF NOT EXISTS public.company_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'post',        -- post, bill, tax, insurance, bank, other
  file_path     TEXT NOT NULL,                       -- in the private 'capture' bucket
  file_name     TEXT,
  mime          TEXT,
  received_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_by    UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- A check imported from a photographed sheet keeps a link to the photo, as proof
ALTER TABLE public.compliance_logs ADD COLUMN IF NOT EXISTS source_document_id UUID;

ALTER TABLE public.capture_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capture_items, public.capture_keys, public.company_documents FROM anon, authenticated;

INSERT INTO storage.buckets (id, name, public) VALUES ('capture', 'capture', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;
