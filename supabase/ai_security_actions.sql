-- Manuelle Admin-Sicherheitsaktionen (additiv, keine bestehende Tabelle geändert)
create table if not exists public.ai_security_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  target_type text not null,        -- 'alert' | 'event' | 'ip' | 'route'
  target_key  text not null,        -- z. B. Alert-ID, anonymisierte IP, Route-Pfad
  action_type text not null,        -- 'acknowledged' | 'muted' | 'watchlist'
  note        text null,            -- interne Admin-Notiz (plain text)
  created_by  text null,            -- E-Mail des Admins
  is_active   boolean not null default true
);

create index if not exists ai_security_actions_target_idx
  on public.ai_security_actions (target_type, target_key);

create index if not exists ai_security_actions_created_at_idx
  on public.ai_security_actions (created_at desc);

-- Upsert-Grundlage: unique pro Ziel + Aktionstyp
create unique index if not exists ai_security_actions_unique_target_action_idx
  on public.ai_security_actions (target_key, action_type);
