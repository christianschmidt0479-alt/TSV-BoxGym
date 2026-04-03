alter table public.members
  add column if not exists password_reset_token_hash text,
  add column if not exists password_reset_expires_at timestamptz;

create index if not exists members_password_reset_token_hash_idx
  on public.members (password_reset_token_hash);

create index if not exists members_password_reset_expires_at_idx
  on public.members (password_reset_expires_at desc);