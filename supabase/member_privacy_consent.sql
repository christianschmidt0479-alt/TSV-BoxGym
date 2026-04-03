alter table public.members
  add column if not exists privacy_accepted_at timestamptz;

create index if not exists members_privacy_accepted_at_idx
  on public.members (privacy_accepted_at);