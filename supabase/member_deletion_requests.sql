-- member_deletion_requests.sql
-- Table for member-initiated deletion requests, requiring admin approval

create table if not exists public.member_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  reason text,
  admin_id uuid references public.trainer_accounts(id),
  deleted_at timestamptz
);

-- Index for quick lookup by member
create index if not exists idx_member_deletion_requests_member_id on public.member_deletion_requests(member_id);

-- Only one open request per member
create unique index if not exists uniq_member_deletion_requests_open on public.member_deletion_requests(member_id) where status = 'pending';
