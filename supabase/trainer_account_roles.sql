alter table public.trainer_accounts
  add column if not exists role text not null default 'trainer';

create index if not exists trainer_accounts_role_idx
  on public.trainer_accounts (role);
