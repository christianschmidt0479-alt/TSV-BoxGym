-- Manuelle Admin-IP/Routen-Sperren (additiv, keine bestehende Tabelle geändert)
create table if not exists public.ai_security_blocks (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now()),
  target_type  text not null,        -- 'ip' | 'route'
  target_key   text not null,        -- anonymisierte IP oder Route-Pfad
  block_reason text not null,        -- Pflichtfeld
  created_by   text null,            -- Admin-E-Mail
  is_active    boolean not null default true,
  expires_at   timestamptz null,     -- null = permanent
  note         text null             -- interne Notiz
);

-- Nur eine aktive Sperre pro Ziel zur gleichen Zeit
create unique index if not exists ai_security_blocks_active_target_idx
  on public.ai_security_blocks (target_key)
  where is_active = true;

create index if not exists ai_security_blocks_created_at_idx
  on public.ai_security_blocks (created_at desc);

create index if not exists ai_security_blocks_expires_at_idx
  on public.ai_security_blocks (expires_at)
  where is_active = true;
