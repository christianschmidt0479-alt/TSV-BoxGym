create table if not exists public.member_weight_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  weight_kg numeric not null check (weight_kg >= 20 and weight_kg <= 300),
  source text not null check (source in ('checkin', 'manual')),
  checkin_id uuid null references public.checkins(id) on delete set null,
  note text null,
  created_at timestamptz not null default now()
);

create unique index if not exists member_weight_logs_member_checkin_unique_idx
  on public.member_weight_logs (member_id, checkin_id)
  where checkin_id is not null;

create index if not exists member_weight_logs_member_created_at_idx
  on public.member_weight_logs (member_id, created_at desc);
