-- Run in Supabase SQL editor AFTER estimates-schema.sql
-- Enables manual file uploads on client + job document tabs (separate from estimate PDFs).
-- Reuses the existing private "client-documents" storage bucket.

alter table client_documents
  add column if not exists category text,
  add column if not exists file_name text,
  add column if not exists file_size integer check (file_size is null or file_size > 0),
  add column if not exists uploaded_by uuid references profiles(id) on delete set null,
  add column if not exists notes text;

create index if not exists client_documents_schedule_id_idx on client_documents(schedule_id);
create index if not exists client_documents_category_idx on client_documents(category);
create index if not exists client_documents_source_idx on client_documents(source);

alter table companies
  add column if not exists document_categories jsonb not null default '[]'::jsonb;