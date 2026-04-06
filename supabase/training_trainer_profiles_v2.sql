-- training_trainer_profiles_v2.sql
-- Erweiterte Trainer-KI-Stammdaten: neue Felder für detailliertere KI-Anpassung pro Trainer.
-- Bestehende Felder (style, strengths, focus, notes) bleiben erhalten.
-- Diese Migration vor dem nächsten Deployment ausführen.

ALTER TABLE public.training_trainer_profiles
  ADD COLUMN IF NOT EXISTS internal_label           text,
  ADD COLUMN IF NOT EXISTS trainer_license          text,
  ADD COLUMN IF NOT EXISTS trainer_experience_level text,
  ADD COLUMN IF NOT EXISTS trainer_limitations      text,
  ADD COLUMN IF NOT EXISTS trainer_group_handling   text,
  ADD COLUMN IF NOT EXISTS trainer_pedagogy_notes   text,
  ADD COLUMN IF NOT EXISTS preferred_structure_level text,
  ADD COLUMN IF NOT EXISTS admin_internal_notes     text;
