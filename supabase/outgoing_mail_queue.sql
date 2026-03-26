create table if not exists public.outgoing_mail_queue (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('competition_assigned', 'competition_removed', 'medical_exam_reminder_member', 'medical_exam_reminder_admin')),
  email text not null,
  name text,
  context_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_batch_key text
);

alter table public.outgoing_mail_queue
  add column if not exists context_key text;

create index if not exists outgoing_mail_queue_sent_at_idx
  on public.outgoing_mail_queue (sent_at);

create index if not exists outgoing_mail_queue_created_at_idx
  on public.outgoing_mail_queue (created_at);

create index if not exists outgoing_mail_queue_context_key_idx
  on public.outgoing_mail_queue (context_key);
