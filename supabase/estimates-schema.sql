-- Run in Supabase SQL editor — estimates, line items, and client documents.

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'converted')),
  total numeric not null default 0 check (total >= 0),
  schedule_id uuid references schedules(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  amount numeric not null default 0 check (amount >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  estimate_id uuid references estimates(id) on delete cascade,
  schedule_id uuid references schedules(id) on delete set null,
  name text not null,
  storage_path text not null,
  file_type text not null default 'application/pdf',
  source text not null default 'estimate' check (source in ('estimate', 'upload')),
  created_at timestamptz not null default now()
);

create index if not exists estimates_client_id_idx on estimates(client_id);
create index if not exists estimates_company_id_idx on estimates(company_id);
create index if not exists estimate_line_items_estimate_id_idx on estimate_line_items(estimate_id);
create index if not exists client_documents_client_id_idx on client_documents(client_id);
create index if not exists client_documents_estimate_id_idx on client_documents(estimate_id);

-- Storage: create a private bucket named "client-documents" in Supabase Dashboard
-- (Storage → New bucket → client-documents, public: off)