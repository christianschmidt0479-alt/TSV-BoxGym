-- Tabelle für zentrales App-Fehlermodul
create table if not exists public.app_errors (
  id                uuid        primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  source            text        not null,
  route             text        null,
  error_type        text        not null,
  severity          text        not null check (severity in ('low','medium','high','critical')),
  message           text        not null,
  details           text        null,
  actor             text        null,
  actor_role        text        null,
  ip                text        null,
  fingerprint       text        null,
  status            text        not null default 'open'
                    check (status in ('open','acknowledged','resolved','ignored')),
  note              text        null,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  occurrence_count  integer     not null default 1
);

-- Indizes für Performance
create index if not exists app_errors_created_at_idx    on public.app_errors (created_at desc);
create index if not exists app_errors_severity_idx      on public.app_errors (severity);
create index if not exists app_errors_status_idx        on public.app_errors (status);
create index if not exists app_errors_source_idx        on public.app_errors (source);
create index if not exists app_errors_route_idx         on public.app_errors (route);
create index if not exists app_errors_fingerprint_idx   on public.app_errors (fingerprint);
create index if not exists app_errors_last_seen_at_idx  on public.app_errors (last_seen_at desc);

-- Row Level Security: nur Service-Role hat Zugriff
alter table public.app_errors enable row level security;

-- Kein öffentlicher Zugriff; der App-Layer verwendet den Service-Role-Client
