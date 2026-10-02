-- 197 — Letters & Invoices: every document produced is kept, listed, and can be viewed, downloaded or deleted.
-- "Deleted" hides it from the list (deleted_at) but keeps the record and the PDF: finance records are never
-- destroyed (see 191). PDFs live in the private finance-docs bucket under generated/<id>.pdf.
create table if not exists public.generated_documents (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('invoice', 'letter')),
  number          text,                          -- invoice number, e.g. 20261002013REC; null for letters
  title           text not null default '',      -- invoice title or letter "Re:" line
  recipient_name  text not null default '',
  recipient_email text,
  property_id     uuid references public.properties(id) on delete set null,
  total           numeric(12,2),                 -- invoices only
  storage_path    text not null,
  content         jsonb not null default '{}'::jsonb,   -- the invoice / letter as saved, to reopen or re-render
  created_by      text,                          -- staff email
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  emailed_at      timestamptz,
  emailed_to      text[],
  deleted_at      timestamptz,
  deleted_by      text
);

create index if not exists generated_documents_created_idx on public.generated_documents (created_at desc) where deleted_at is null;
create unique index if not exists generated_documents_invoice_number_idx
  on public.generated_documents (number) where kind = 'invoice' and deleted_at is null;

-- Office-only, through the API (service role). Nobody reads it directly from the browser.
alter table public.generated_documents enable row level security;
