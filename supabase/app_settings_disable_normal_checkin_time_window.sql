insert into public.app_settings (key, value_json)
values ('disable_normal_checkin_time_window', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;
