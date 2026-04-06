-- Migration: extend admin_mailbox.status check to include 'deleted'
-- Run once against the Supabase project.

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.admin_mailbox'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admin_mailbox DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.admin_mailbox
  ADD CONSTRAINT admin_mailbox_status_check
  CHECK (status IN ('open', 'draft', 'done', 'sent', 'deleted'));
