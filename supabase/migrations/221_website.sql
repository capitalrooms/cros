-- 221 — The Website section in CROS (Harry, 14 Oct 2026: "have a place on our admin app called website").
-- The new capitalrooms.co.uk (switching from GNB on 1 Dec 2026) reads its advice posts and its rooms from here, so the
-- office edits the site without Claude. Safe to run more than once.

-- Advice posts (the blog). body is simple markdown: ## headings, **bold**, [links](…), ![](images), - lists.
CREATE TABLE IF NOT EXISTS public.website_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,                       -- the address: /advice/<slug>
  title         TEXT NOT NULL,
  excerpt       TEXT,                                       -- the line under the title in lists and Google
  body          TEXT NOT NULL DEFAULT '',
  cover_url     TEXT,
  category      TEXT NOT NULL DEFAULT 'tenants' CHECK (category IN ('tenants', 'landlords', 'area', 'rooms', 'news')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  publish_at    TIMESTAMPTZ,                                -- published + a future time = scheduled; it shows from then
  shown_date    DATE,                                       -- the date printed on the post
  old_path      TEXT,                                       -- its address on the old GNB site, redirected at launch
  note          TEXT,                                       -- for the office only
  created_by    TEXT,
  updated_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_posts_live_idx ON public.website_posts (status, publish_at);
ALTER TABLE public.website_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_posts FROM anon, authenticated;   -- read and written through the API only

-- Which rooms appear on the website (an available room, ticked by the office; cleared when it's let agreed)
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT FALSE;

-- Pictures for posts and pages — public, like any website image
INSERT INTO storage.buckets (id, name, public) VALUES ('website', 'website', TRUE) ON CONFLICT (id) DO NOTHING;
