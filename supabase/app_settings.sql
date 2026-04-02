create table if not exists public.app_settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.app_settings (key, value_json)
values ('disable_checkin_time_window', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;