create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_role text not null,
  actor_email text null,
  actor_name text null,
  action text not null,
  target_type text not null,
  target_id text null,
  target_name text null,
  details text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
