-- ============================================================
-- RLS für alle public-Tabellen ohne RLS
-- Stand: 2026-04-06
--
-- Strategie: Alle betroffenen Tabellen werden ausschließlich
-- serverseitig über den service_role-Key aufgerufen.
-- Der service_role-Key bypasses RLS vollständig (Supabase-Standard).
-- → Keine permissiven Policies → kein anon-/authenticated-Zugriff.
-- → REVOKE zusätzlich als Defense-in-Depth.
--
-- Betrifft nicht:
--   public.members          → RLS bereits aktiv (member_auth_rls.sql)
--   public.admin_mailbox    → RLS bereits aktiv (admin_mailbox_security.sql)
--   public.app_errors       → RLS bereits aktiv (app_errors.sql)
-- ============================================================

-- ─── Hilfsfunktion: alle Policies einer Tabelle droppen ──────────────────────

do $$
declare
  t text;
  policy_record record;
begin
  foreach t in array array[
    'app_settings',
    'ai_security_events',
    'ai_security_blocks',
    'ai_security_actions',
    'outgoing_mail_queue',
    'admin_notification_queue',
    'trainer_accounts',
    'parent_accounts',
    'parent_child_links',
    'office_reconciliation_runs'
  ]
  loop
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, t);
    end loop;
  end loop;
end $$;

-- ─── app_settings ─────────────────────────────────────────────────────────────
-- Zugriff: nur service_role (checkinSettingsDb, aiSettingsDb, adminNavSeenDb,
--          aiSecurityNotifications)
-- Kein Lese-/Schreibzugriff für anon oder authenticated nötig.

revoke all on table public.app_settings from anon;
revoke all on table public.app_settings from authenticated;
alter table public.app_settings enable row level security;

-- ─── ai_security_events ───────────────────────────────────────────────────────
-- Zugriff: nur service_role (aiSecurityEventsDb, admin nav-badges route)
-- Enthält IP-Adressen und Sicherheitsereignisse → besonders sensibel.

revoke all on table public.ai_security_events from anon;
revoke all on table public.ai_security_events from authenticated;
alter table public.ai_security_events enable row level security;

-- ─── ai_security_blocks ───────────────────────────────────────────────────────
-- Zugriff: nur service_role (aiSecurityBlocksDb)
-- Enthält Block-Konfigurationen und Admin-Daten → sensibel.

revoke all on table public.ai_security_blocks from anon;
revoke all on table public.ai_security_blocks from authenticated;
alter table public.ai_security_blocks enable row level security;

-- ─── ai_security_actions ──────────────────────────────────────────────────────
-- Zugriff: nur service_role (aiSecurityActionsDb)
-- Enthält Admin-Sicherheitsaktionen → sensibel.

revoke all on table public.ai_security_actions from anon;
revoke all on table public.ai_security_actions from authenticated;
alter table public.ai_security_actions enable row level security;

-- ─── outgoing_mail_queue ──────────────────────────────────────────────────────
-- Zugriff: nur service_role (outgoingMailQueueDb, manualAdminMailOutboxDb,
--          manualParentMailOutboxDb, adminMailboxDb, mail-overview/inbox routes)
-- Enthält E-Mail-Adressen und Namen → sensibel.

revoke all on table public.outgoing_mail_queue from anon;
revoke all on table public.outgoing_mail_queue from authenticated;
alter table public.outgoing_mail_queue enable row level security;

-- ─── admin_notification_queue ─────────────────────────────────────────────────
-- Zugriff: nur service_role (adminMailboxDb, adminDigestDb, overview/mail routes)
-- Enthält Mitgliednamen und E-Mail-Adressen → sensibel.

revoke all on table public.admin_notification_queue from anon;
revoke all on table public.admin_notification_queue from authenticated;
alter table public.admin_notification_queue enable row level security;

-- ─── trainer_accounts ─────────────────────────────────────────────────────────
-- Zugriff: service_role in Produktion (trainerDb, boxgymDb, admin-routes)
-- Enthält password_hash, E-Mail, Lizenzdaten → hochsensibel.

revoke all on table public.trainer_accounts from anon;
revoke all on table public.trainer_accounts from authenticated;
alter table public.trainer_accounts enable row level security;

-- ─── parent_accounts ──────────────────────────────────────────────────────────
-- Zugriff: service_role (nach Fix in parentAccountsDb.ts)
--          Zuvor: anon-Key → Sicherheitslücke behoben durch Code-Änderung.
-- Enthält access_code_hash, E-Mail, Telefon → hochsensibel.

revoke all on table public.parent_accounts from anon;
revoke all on table public.parent_accounts from authenticated;
alter table public.parent_accounts enable row level security;

-- ─── parent_child_links ───────────────────────────────────────────────────────
-- Zugriff: service_role (nach Fix in parentAccountsDb.ts, parentMailDrafts,
--          admin/members-overview)
-- Verknüpft Elternkonten mit Mitgliedern → sensibel.

revoke all on table public.parent_child_links from anon;
revoke all on table public.parent_child_links from authenticated;
alter table public.parent_child_links enable row level security;

-- ─── office_reconciliation_runs ───────────────────────────────────────────────
-- Zugriff: nur service_role (admin/excel-abgleich route)
-- Enthält Abgleichsdaten und Mitgliederreihen → sensibel.

revoke all on table public.office_reconciliation_runs from anon;
revoke all on table public.office_reconciliation_runs from authenticated;
alter table public.office_reconciliation_runs enable row level security;

-- ============================================================
-- KEINE permissiven Policies für die oben genannten Tabellen.
-- Der service_role-Key umgeht RLS vollständig (Supabase-Standard).
-- anon und authenticated haben nach REVOKE + RLS keinerlei Zugriff.
-- ============================================================
