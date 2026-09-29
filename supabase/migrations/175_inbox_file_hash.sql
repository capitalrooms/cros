-- Add file_hash to inbox_documents for deduplication
-- Allows the scan engine to reuse AI results when the same file arrives twice
alter table inbox_documents
  add column if not exists file_hash text;

create index if not exists inbox_documents_file_hash_idx
  on inbox_documents (file_hash)
  where file_hash is not null and ai_result is not null;
