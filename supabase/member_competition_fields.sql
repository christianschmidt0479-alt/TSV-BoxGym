alter table public.members
  add column if not exists is_competition_member boolean not null default false,
  add column if not exists competition_license_number text,
  add column if not exists last_medical_exam_date date,
  add column if not exists competition_fights integer not null default 0,
  add column if not exists competition_wins integer not null default 0,
  add column if not exists competition_losses integer not null default 0,
  add column if not exists competition_draws integer not null default 0;

create index if not exists members_is_competition_member_idx
  on public.members (is_competition_member);
