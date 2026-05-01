alter table public.members
  add column if not exists gs_match_email text;

create index if not exists members_gs_match_email_idx
  on public.members (gs_match_email);
