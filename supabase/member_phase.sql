-- Add member_phase column to track trial extension state
-- Values: 'trial' (default), 'extended' (trainer granted extra check-ins)

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS member_phase TEXT NOT NULL DEFAULT 'trial';

-- Backfill: non-trial members get NULL-equivalent via existing is_trial=false
-- For existing trial members, phase stays 'trial' (default is correct)
-- For existing non-trial members, set phase to 'member'
UPDATE members SET member_phase = 'member' WHERE is_trial = false;

-- Note: phase 'extended' is set only by trainers via /api/trainer/extend-member
