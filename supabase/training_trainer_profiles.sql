-- training_trainer_profiles.sql
-- KI-Profil pro Trainer: wird bei der Plan-Generierung als Feinsteuerung eingebunden.
-- Niedrige Priorität – nur zur besseren Anpassung des Coaching-Stils, nicht als harte Anforderung.

CREATE TABLE IF NOT EXISTS public.training_trainer_profiles (
  trainer_id uuid PRIMARY KEY,
  style      text,
  strengths  text,
  focus      text,
  notes      text,
  updated_at timestamptz DEFAULT now()
);
