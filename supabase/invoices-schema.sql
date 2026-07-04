-- Run in Supabase SQL editor
-- Invoice PDFs stored in client_documents with source = 'invoice'.

alter table companies add column if not exists invoice_template jsonb;

alter table client_documents drop constraint if exists client_documents_source_check;

alter table client_documents
  add constraint client_documents_source_check
  check (source in ('estimate', 'upload', 'invoice'));

create unique index if not exists client_documents_invoice_schedule_uidx
  on client_documents(schedule_id)
  where source = 'invoice' and schedule_id is not null;