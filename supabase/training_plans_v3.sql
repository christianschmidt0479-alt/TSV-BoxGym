-- Migration: Trainingsziel (training_focus) und Trainingsmodus (training_mode)
-- zur bestehenden training_plans Tabelle hinzufügen.
-- Bestehende Zeilen erhalten NULL (graceful fallback im Code).

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS training_focus text NULL,
  ADD COLUMN IF NOT EXISTS training_mode  text NULL;
