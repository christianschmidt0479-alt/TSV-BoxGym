alter table public.members
  add column if not exists competition_target_weight numeric;
