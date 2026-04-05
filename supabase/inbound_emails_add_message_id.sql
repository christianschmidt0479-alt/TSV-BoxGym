-- Migration: message_id-Spalte für Dedup hinzufügen
alter table public.inbound_emails add column if not exists message_id text;

create unique index if not exists inbound_emails_message_id_idx
  on public.inbound_emails (message_id) where message_id is not null;
