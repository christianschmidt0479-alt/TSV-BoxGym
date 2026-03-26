create table if not exists public.parent_accounts (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  email text not null,
  phone text,
  access_code_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists parent_accounts_email_idx
  on public.parent_accounts (email);

create table if not exists public.parent_child_links (
  id uuid primary key default gen_random_uuid(),
  parent_account_id uuid not null references public.parent_accounts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists parent_child_links_member_id_idx
  on public.parent_child_links (member_id);

create unique index if not exists parent_child_links_parent_member_idx
  on public.parent_child_links (parent_account_id, member_id);
