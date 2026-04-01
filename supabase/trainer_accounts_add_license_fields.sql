-- Add license fields for trainer management
alter table if exists public.trainer_accounts
  add column if not exists lizenzart text null,
  add column if not exists lizenznummer text null,
  add column if not exists lizenz_gueltig_bis date null,
  add column if not exists lizenz_verband text null,
  add column if not exists bemerkung text null;
