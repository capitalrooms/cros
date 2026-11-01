-- Migration 254: receipts and other files sent with an invoice or letter (1 Nov 2026). Kept with the document, shown
-- to the landlord in their app (Your documents) and on a private link in the email, so a landlord who isn't in the
-- app yet still sees them. Files live in the private finance-docs bucket under generated/<document id>/files/.
-- "Removed" hides a file but keeps it (finance records are never destroyed).
create table if not exists public.generated_document_files (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.generated_documents(id) on delete cascade,
  storage_path  text not null,
  file_name     text not null,
  content_type  text not null,
  size_bytes    integer,
  uploaded_by   text,
  created_at    timestamptz not null default now(),
  removed_at    timestamptz
);
create index if not exists generated_document_files_doc_idx on public.generated_document_files (document_id) where removed_at is null;
alter table public.generated_document_files enable row level security;   -- office API only (service role)

alter table public.generated_documents add column if not exists share_token text unique;   -- the email's private link
