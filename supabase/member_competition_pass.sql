alter table public.members
  add column if not exists has_competition_pass boolean not null default false;

create index if not exists members_has_competition_pass_idx
  on public.members (has_competition_pass);
