create table if not exists public.member_update_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists member_update_tokens_member_id_idx
  on public.member_update_tokens(member_id);

create index if not exists member_update_tokens_expires_at_idx
  on public.member_update_tokens(expires_at);