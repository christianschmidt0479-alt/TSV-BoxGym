-- member_qr_token.sql
-- Adds a unique, opaque QR token and an active-flag to every member row.
-- Run once against the Supabase DB (SQL editor or migration tool).

-- 1. Add columns (idempotent)
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS member_qr_token text,
  ADD COLUMN IF NOT EXISTS member_qr_active boolean NOT NULL DEFAULT true;

-- 2. Unique constraint (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_member_qr_token_key'
      AND conrelid = 'members'::regclass
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_member_qr_token_key UNIQUE (member_qr_token);
  END IF;
END
$$;

-- 3. Backfill: generate tokens for all existing members that have none.
--    gen_random_uuid() is available in every Supabase project (pgcrypto / pg extension).
UPDATE members
SET member_qr_token = replace(gen_random_uuid()::text, '-', '')
WHERE member_qr_token IS NULL;

-- 4. Make the column NOT NULL now that all rows have a value.
ALTER TABLE members
  ALTER COLUMN member_qr_token SET NOT NULL;
