alter table public.checkins
  add column if not exists checkin_mode text not null default 'normal';

update public.checkins
set checkin_mode = 'normal'
where checkin_mode is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'checkins_checkin_mode_check'
  ) then
    alter table public.checkins
      add constraint checkins_checkin_mode_check
      check (checkin_mode in ('normal', 'ferien'));
  end if;
end $$;

create index if not exists checkins_checkin_mode_idx
  on public.checkins (checkin_mode);