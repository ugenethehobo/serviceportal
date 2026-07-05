-- Solo business mode: owner-operated companies without multi-crew management.
alter table companies add column if not exists is_solo_business boolean not null default false;