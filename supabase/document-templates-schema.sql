-- Unified visual document templates for invoices and estimates.
-- Run in Supabase SQL editor.

alter table companies add column if not exists document_templates jsonb;