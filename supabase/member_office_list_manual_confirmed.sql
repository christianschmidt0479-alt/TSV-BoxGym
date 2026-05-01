alter table public.members
  add column if not exists office_list_manual_confirmed boolean default false;
