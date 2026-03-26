alter table public.members
  drop constraint if exists members_member_pin_format;

alter table public.members
  add constraint members_member_pin_format
  check (
    member_pin is null
    or member_pin ~ '^[A-Za-z0-9]{6,16}$'
  );
