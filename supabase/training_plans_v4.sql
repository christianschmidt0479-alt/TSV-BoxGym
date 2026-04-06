-- Migration: training_time (Uhrzeit der Trainingseinheit) hinzufügen
-- Bestehende Zeilen erhalten NULL (optional, graceful fallback im Code).

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS training_time text NULL;
