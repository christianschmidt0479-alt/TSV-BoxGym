-- 1. Boxzwerge / guardian_name
alter table public.members
  add column if not exists guardian_name text;

-- 2. Admin-Sammelmail-Queue
create table if not exists public.admin_notification_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('member', 'trainer', 'boxzwerge')),
  member_name text not null,
  email text,
  group_name text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_batch_key text
);

create index if not exists admin_notification_queue_sent_at_idx
  on public.admin_notification_queue (sent_at);

create index if not exists admin_notification_queue_created_at_idx
  on public.admin_notification_queue (created_at);

-- 3. Zugangscode-Constraint auf den aktuellen App-Stand bringen
alter table public.members
  drop constraint if exists members_member_pin_format;

alter table public.members
  add constraint members_member_pin_format
  check (
    member_pin is null
    or member_pin ~ '^[A-Za-z0-9]{6,16}$'
    or member_pin ~ '^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$'
    or member_pin ~ '^[A-Fa-f0-9]{64}$'
  );

-- 4. GS-Abgleich-Felder fuer den Office-Sammelabgleich
alter table public.members
  add column if not exists office_list_status text,
  add column if not exists office_list_group text,
  add column if not exists office_list_checked_at timestamptz;

alter table public.members
  drop constraint if exists members_office_list_status_check;

alter table public.members
  add constraint members_office_list_status_check
  check (office_list_status is null or office_list_status in ('green', 'yellow', 'red'));

create index if not exists members_office_list_status_idx
  on public.members (office_list_status);

-- 5. Datenschutz-Zustimmung fuer bestehende Mitglieder
alter table public.members
  add column if not exists privacy_accepted_at timestamptz;

create index if not exists members_privacy_accepted_at_idx
  on public.members (privacy_accepted_at);

-- 6. Supabase Auth-Verknuepfung und RLS fuer Mitglieder
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

create index if not exists members_office_list_checked_at_idx
  on public.members (office_list_checked_at desc);

create table if not exists public.office_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  is_active boolean not null default true,
  run_status text not null default 'green'
    check (run_status in ('green', 'gray')),
  file_count integer not null default 0,
  files jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists office_reconciliation_runs_active_idx
  on public.office_reconciliation_runs (is_active, checked_at desc);

-- 7. Mitglieder-Passwort-Reset per Mail
alter table public.members
  add column if not exists password_reset_token_hash text,
  add column if not exists password_reset_expires_at timestamptz;

create index if not exists members_password_reset_token_hash_idx
  on public.members (password_reset_token_hash);

create index if not exists members_password_reset_expires_at_idx
  on public.members (password_reset_expires_at desc);
