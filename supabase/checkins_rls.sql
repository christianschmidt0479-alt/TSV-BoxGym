-- ============================================================
-- RLS für public.checkins
-- Stand: 2026-04-06
--
-- Strategie: checkins wird ausschließlich serverseitig über
-- den service_role-Key aufgerufen. Der service_role-Key
-- bypasses RLS vollständig (Supabase-Standard).
-- → Keine permissiven Policies → kein anon-/authenticated-Zugriff.
-- → REVOKE zusätzlich als Defense-in-Depth.
--
-- Alle bisherigen anon-Zugriffe (member-checkin, member-fast-checkin,
-- trial-checkin) wurden auf createServerSupabaseServiceClient()
-- umgestellt (Commit checkins_rls.sql).
--
-- Lesezugriff über auth.uid() ist bewusst NICHT aktiviert –
-- Mitglieder greifen auf ihre Check-ins nur über /api/public/member-area
-- zu, das seinerseits service_role nutzt.
-- ============================================================

-- ─── Bestehende Policies droppen (idempotent) ─────────────────────────────────

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'checkins'
  loop
    execute format('drop policy if exists %I on public.checkins', policy_record.policyname);
  end loop;
end $$;

-- ─── REVOKE Defense-in-Depth ──────────────────────────────────────────────────

revoke all on table public.checkins from anon;
revoke all on table public.checkins from authenticated;

-- ─── RLS aktivieren ───────────────────────────────────────────────────────────

alter table public.checkins enable row level security;

-- ============================================================
-- KEINE permissiven Policies.
-- Der service_role-Key umgeht RLS vollständig.
-- anon und authenticated haben nach REVOKE + RLS keinerlei Zugriff.
-- ============================================================
