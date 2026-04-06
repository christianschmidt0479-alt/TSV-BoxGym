create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  group_key text not null,
  age_group text null,
  performance_level text null,
  participant_count integer null,
  trainer_count integer null,
  duration_minutes integer null,
  training_goal text null,
  sparring_allowed boolean not null default false,
  ring_available boolean not null default false,
  ai_context text null,
  generated_plan text null,
  status text not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists training_plans_date_idx
  on public.training_plans (date desc);

create index if not exists training_plans_status_idx
  on public.training_plans (status);
