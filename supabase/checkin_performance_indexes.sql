-- Performance-Indexes für Check-in-Flows
-- Bundle 1 / M-2
-- Manuell in der Supabase SQL-Konsole ausführen.
-- Alle Statements sind idempotent (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_checkins_member_date
  ON public.checkins(member_id, date);

CREATE INDEX IF NOT EXISTS idx_checkins_member_created
  ON public.checkins(member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkins_date_created
  ON public.checkins(date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_members_email_created
  ON public.members(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_members_qr_token
  ON public.members(member_qr_token);

CREATE INDEX IF NOT EXISTS idx_checkins_v2_member_time
  ON public.checkins_v2(member_id, checkin_time DESC);
