revoke all on table public.admin_mailbox from anon;
revoke all on table public.admin_mailbox from authenticated;

alter table public.admin_mailbox enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_mailbox'
  loop
    execute format('drop policy if exists %I on public.admin_mailbox', policy_record.policyname);
  end loop;
end $$;