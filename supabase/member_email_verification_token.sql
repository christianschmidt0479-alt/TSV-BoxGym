-- Migration: Add persistent email verification token for members
-- Run manually after review!

ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS email_verification_token text;

ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS members_email_verification_token_idx
ON public.members (email_verification_token);