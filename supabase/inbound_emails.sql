create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  from_email text not null default '',
  to_email text not null default '',
  subject text not null default '',
  text text not null default '',
  html text not null default '',
  received_at timestamptz not null default timezone('utc', now()),
  raw_headers jsonb
);

create index if not exists inbound_emails_received_at_idx on public.inbound_emails (received_at desc);
