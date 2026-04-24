alter table public.members
  add column if not exists email_verification_consumed_at timestamptz;

alter table public.members
  add column if not exists email_verification_consumed_token_hash text;