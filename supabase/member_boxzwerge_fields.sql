alter table public.members
  add column if not exists guardian_name text;
