-- KI-Sicherheitsereignisse (additiv, keine bestehende Tabelle geändert)
create table if not exists public.ai_security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  type text not null,          -- z. B. 'login_failure', 'rate_limit', 'api_error'
  route text null,
  ip text null,
  actor text null,
  severity text not null default 'low', -- 'low' | 'medium' | 'high'
  detail text null,
  source text not null default 'system'
);

create index if not exists ai_security_events_created_at_idx
  on public.ai_security_events (created_at desc);

create index if not exists ai_security_events_severity_idx
  on public.ai_security_events (severity);
