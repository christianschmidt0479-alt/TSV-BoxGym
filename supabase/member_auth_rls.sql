alter table public.members
  add column if not exists auth_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_auth_user_id_fkey'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id)
      on delete set null;
  end if;
end $$;

create index if not exists members_auth_user_id_idx
  on public.members (auth_user_id);

alter table public.members enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'members'
  loop
    execute format('drop policy if exists %I on public.members', policy_record.policyname);
  end loop;
end $$;

create policy members_select_own_record
  on public.members
  for select
  using (auth.uid() = auth_user_id);