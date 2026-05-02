alter table if exists public.trainer_accounts
  add column if not exists trainer_birthdate date;

alter table if exists public.trainer_accounts
  add column if not exists dosb_license text;
