alter table public.members
  drop constraint if exists members_member_pin_format;

alter table public.members
  add constraint members_member_pin_format
  check (
    member_pin is null
    or member_pin ~ '^[A-Za-z0-9]{6,16}$'
    or member_pin ~ '^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$'
    or member_pin ~ '^[A-Fa-f0-9]{64}$'
  );
