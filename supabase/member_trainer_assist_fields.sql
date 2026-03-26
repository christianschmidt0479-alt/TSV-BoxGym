alter table public.members
  add column if not exists needs_trainer_assist_checkin boolean not null default false;

create index if not exists members_needs_trainer_assist_checkin_idx
  on public.members (needs_trainer_assist_checkin);
