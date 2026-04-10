-- Trainer Passwort-Reset Felder
ALTER TABLE trainer_accounts
ADD COLUMN IF NOT EXISTS password_reset_token_hash text,
ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS trainer_accounts_password_reset_token_hash_idx
  ON public.trainer_accounts (password_reset_token_hash);

CREATE INDEX IF NOT EXISTS trainer_accounts_password_reset_expires_at_idx
  ON public.trainer_accounts (password_reset_expires_at DESC);
