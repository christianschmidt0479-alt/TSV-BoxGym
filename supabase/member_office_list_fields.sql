alter table public.members
  add column if not exists office_list_status text,
  add column if not exists office_list_group text,
  add column if not exists office_list_checked_at timestamptz;

alter table public.members
  drop constraint if exists members_office_list_status_check;

alter table public.members
  add constraint members_office_list_status_check
  check (office_list_status is null or office_list_status in ('green', 'yellow', 'red'));

create index if not exists members_office_list_status_idx
  on public.members (office_list_status);

create index if not exists members_office_list_checked_at_idx
  on public.members (office_list_checked_at desc);

create table if not exists public.office_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  is_active boolean not null default true,
  run_status text not null default 'green'
    check (run_status in ('green', 'gray')),
  file_count integer not null default 0,
  files jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists office_reconciliation_runs_active_idx
  on public.office_reconciliation_runs (is_active, checked_at desc);