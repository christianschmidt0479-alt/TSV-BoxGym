create table if not exists public.admin_mailbox (
  id text primary key,
  sender text,
  recipient text,
  subject text,
  snippet text,
  content text not null default '',
  status text not null check (status in ('open', 'draft', 'done', 'sent', 'deleted')),
  type text not null check (type in ('inbox', 'draft')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_mailbox_type_status_created_at_idx on public.admin_mailbox (type, status, created_at desc);