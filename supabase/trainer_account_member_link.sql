alter table public.trainer_accounts
  add column if not exists linked_member_id uuid references public.members(id) on delete set null;

create index if not exists trainer_accounts_linked_member_id_idx
  on public.trainer_accounts (linked_member_id);
