alter table public.members
  add column if not exists last_verification_sent_at timestamptz;
