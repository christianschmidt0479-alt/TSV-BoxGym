alter table public.members
  add column if not exists created_from_excel boolean not null default false;
