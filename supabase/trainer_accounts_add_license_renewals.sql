-- Add trainer_license_renewals array column for trainer accounts
alter table if exists public.trainer_accounts
  add column if not exists trainer_license_renewals text[] null;
