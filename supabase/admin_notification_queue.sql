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
