-- Add trainer_license_renewals column (array of dates/strings)
alter table if exists public.trainer_accounts
  add column if not exists trainer_license_renewals text[] null;
