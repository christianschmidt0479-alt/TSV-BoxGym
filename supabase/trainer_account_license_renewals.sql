alter table public.trainer_accounts
  add column if not exists trainer_license_renewals text[] not null default '{}'::text[];
