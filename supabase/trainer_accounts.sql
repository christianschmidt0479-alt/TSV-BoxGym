create table if not exists public.trainer_accounts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  trainer_license text,
  password_hash text not null,
  email_verified boolean not null default false,
  email_verified_at timestamptz,
  email_verification_token text,
  is_approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trainer_accounts_created_at_idx
  on public.trainer_accounts (created_at desc);

create index if not exists trainer_accounts_email_idx
  on public.trainer_accounts (email);

create unique index if not exists trainer_accounts_email_verification_token_idx
  on public.trainer_accounts (email_verification_token)
  where email_verification_token is not null;
