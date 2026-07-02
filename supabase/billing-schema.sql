-- Run this in the Supabase SQL editor to enable job billing.

create table if not exists billing_line_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  amount numeric not null default 0 check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists billing_payments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'other',
  notes text,
  source text not null default 'manual' check (source in ('manual', 'stripe')),
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now()
);

-- If billing_payments already exists, run:
-- alter table billing_payments add column if not exists source text not null default 'manual' check (source in ('manual', 'stripe'));
-- alter table billing_payments add column if not exists stripe_payment_intent_id text unique;

create index if not exists billing_line_items_schedule_id_idx on billing_line_items(schedule_id);
create index if not exists billing_line_items_client_id_idx on billing_line_items(client_id);
create index if not exists billing_payments_schedule_id_idx on billing_payments(schedule_id);
create index if not exists billing_payments_client_id_idx on billing_payments(client_id);